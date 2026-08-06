'use client'

/**
 * The whole app's client-side state, in one context.
 *
 * Three things need to agree at all times — which note the sidebar highlights,
 * which tab is showing it, and what the status bar counts — and they are in
 * three different subtrees. A context is the smallest thing that makes them
 * agree without prop-drilling through the tab bar, and it means a graph node,
 * a backlink and a sidebar row can all call the same `open()`.
 *
 * The vault index (`/api/notes` + `/api/tree`) is loaded here rather than in
 * the sidebar because tab titles, the quick switcher and the tag filter all
 * read it. One request each, one retry path, one place that knows the database
 * is down.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { FolderNode, Note, NoteSummary, TagCount } from '@/lib/types'
import { apiFetch, RequestError, toFailure, useApi, type Failure } from './useApi'

/* ------------------------------------------------------------------- tabs */

export type TabKind = 'note' | 'graph' | 'explore'

/** What a caller asks to open. Titles are optional — we resolve them. */
export type OpenTarget =
  | { kind: 'note'; slug: string; title?: string }
  | { kind: 'graph'; slug?: string }
  | { kind: 'explore' }

export interface Tab {
  /** Deterministic, so "is this already open?" is a lookup, not a search. */
  id: string
  kind: TabKind
  /** The note for a note tab; the focused note for a local graph tab. */
  slug?: string
  /** Fallback label, used until the vault index can supply the real title. */
  title: string
}

export interface Pane {
  id: string
  tabs: Tab[]
  activeId: string | null
}

export interface OpenOptions {
  /** Which pane to open in. Defaults to the focused one. */
  paneId?: string
  /** Force a new tab instead of reusing the active note tab (⌘/Ctrl-click). */
  newTab?: boolean
}

/**
 * Graph tabs collapse to one per pane: Obsidian has a single graph view whose
 * focus moves, and one tab per note you glanced at would be unusable.
 */
function tabIdFor(target: OpenTarget): string {
  if (target.kind === 'note') return `note:${target.slug}`
  if (target.kind === 'graph') return 'graph'
  return 'explore'
}

function fallbackTitle(target: OpenTarget): string {
  if (target.kind === 'graph') return 'Graph'
  if (target.kind === 'explore') return 'Explore'
  return (
    target.title ??
    target.slug.replace(/-/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase())
  )
}

let paneCounter = 0
const nextPaneId = () => `pane-${++paneCounter}`

/* ---------------------------------------------------------------- sidebar */

export type SidebarPane = 'files' | 'search' | 'tags'

/* ------------------------------------------------------------------ store */

export interface VaultIndex {
  notes: NoteSummary[]
  folders: FolderNode[]
  tags: TagCount[]
  loading: boolean
  /** The vault index failed. A DB_* code here means the app is unusable. */
  error: Failure | null
  reload: () => void
}

export interface VaultStore {
  /* panes and tabs */
  panes: Pane[]
  activePaneId: string
  activeTab: Tab | null
  open: (target: OpenTarget, options?: OpenOptions) => void
  closeTab: (paneId: string, tabId: string) => void
  selectTab: (paneId: string, tabId: string) => void
  focusPane: (paneId: string) => void
  splitPane: () => void
  closePane: (paneId: string) => void
  /** 0.2–0.8. Fraction of the main area given to the left pane. */
  splitRatio: number
  setSplitRatio: (ratio: number) => void

  /* sidebar */
  sidebarPane: SidebarPane
  setSidebarPane: (pane: SidebarPane) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  tagFilter: string | null
  setTagFilter: (tag: string | null) => void

  /* quick switcher */
  quickOpen: boolean
  setQuickOpen: (open: boolean) => void

  /* vault index */
  vault: VaultIndex
  titleFor: (slug: string) => string | null
  summaryFor: (slug: string) => NoteSummary | null
  createNote: (folder?: string | null) => Promise<void>

  /* transient feedback */
  notice: string | null
  notify: (message: string) => void
}

const VaultContext = createContext<VaultStore | null>(null)

export function useVault(): VaultStore {
  const store = useContext(VaultContext)
  if (!store) throw new Error('useVault must be used inside <VaultProvider>')
  return store
}

const SIDEBAR_MIN = 190
const SIDEBAR_MAX = 460
const STORAGE_KEY = 'vault:shell'

interface Persisted {
  sidebarWidth?: number
  sidebarCollapsed?: boolean
  sidebarPane?: SidebarPane
}

export function VaultProvider({
  children,
  initialSlug,
}: {
  children: React.ReactNode
  /** Deep link: /note/[slug] boots with that note already open. */
  initialSlug?: string
}) {
  /* ---- panes ---- */

  const [panes, setPanes] = useState<Pane[]>(() => {
    const id = nextPaneId()
    if (!initialSlug) return [{ id, tabs: [], activeId: null }]
    const target: OpenTarget = { kind: 'note', slug: initialSlug }
    const tab: Tab = {
      id: tabIdFor(target),
      kind: 'note',
      slug: initialSlug,
      title: fallbackTitle(target),
    }
    return [{ id, tabs: [tab], activeId: tab.id }]
  })
  const [activePaneId, setActivePaneId] = useState(() => panes[0].id)
  const [splitRatio, setSplitRatio] = useState(0.55)

  // `open` is handed to event handlers all over the tree, long before the
  // focused pane last changed. A ref lets it read the current pane without
  // every callback below it going stale on each focus change.
  const activePaneIdRef = useRef(activePaneId)
  useEffect(() => {
    activePaneIdRef.current = activePaneId
  }, [activePaneId])

  /* ---- sidebar ---- */

  const [sidebarPane, setSidebarPane] = useState<SidebarPane>('files')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidthRaw] = useState(260)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Read layout preferences after mount, never during render: touching
  // localStorage in a useState initialiser would make the server and client
  // markup disagree and React would report a hydration error.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Persisted
      if (typeof saved.sidebarWidth === 'number') {
        setSidebarWidthRaw(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, saved.sidebarWidth)))
      }
      if (typeof saved.sidebarCollapsed === 'boolean') setSidebarCollapsed(saved.sidebarCollapsed)
      if (saved.sidebarPane === 'files' || saved.sidebarPane === 'search' || saved.sidebarPane === 'tags') {
        setSidebarPane(saved.sidebarPane)
      }
    } catch {
      /* A corrupt preference is not worth a broken app. Use the defaults. */
    }
  }, [])

  useEffect(() => {
    try {
      const state: Persisted = { sidebarWidth, sidebarCollapsed, sidebarPane }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* Private mode, quota, disabled storage — none of it should throw here. */
    }
  }, [sidebarWidth, sidebarCollapsed, sidebarPane])

  const setSidebarWidth = useCallback((width: number) => {
    setSidebarWidthRaw(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width))))
  }, [])

  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), [])

  /* ---- vault index ---- */

  const notesState = useApi<NoteSummary[]>('/api/notes')
  const treeState = useApi<{ folders: FolderNode[]; tags: TagCount[] }>('/api/tree')

  // Bound to the two stable `reload` callbacks, never to the state objects:
  // those are new on every render, so an effect keyed on `reloadVault` would
  // re-fetch forever. Pulling them out as locals keeps that explicit — and
  // keeps the exhaustive-deps rule satisfied rather than suppressed.
  const reloadNotes = notesState.reload
  const reloadTree = treeState.reload
  const reloadVault = useCallback(() => {
    reloadNotes()
    reloadTree()
  }, [reloadNotes, reloadTree])

  const notes = useMemo(() => notesState.data ?? [], [notesState.data])

  const bySlug = useMemo(() => {
    const map = new Map<string, NoteSummary>()
    for (const note of notes) map.set(note.slug, note)
    return map
  }, [notes])

  const titleFor = useCallback((slug: string) => bySlug.get(slug)?.title ?? null, [bySlug])
  const summaryFor = useCallback((slug: string) => bySlug.get(slug) ?? null, [bySlug])

  const vault: VaultIndex = useMemo(
    () => ({
      notes,
      folders: treeState.data?.folders ?? [],
      tags: treeState.data?.tags ?? [],
      loading: notesState.loading || treeState.loading,
      // The tree is the structural request: if it fails the whole frame is
      // unusable, so its failure is the one the shell escalates to full-pane.
      error: treeState.error ?? notesState.error,
      reload: reloadVault,
    }),
    [notes, treeState.data, treeState.loading, treeState.error, notesState.loading, notesState.error, reloadVault],
  )

  /* ---- opening things ---- */

  const open = useCallback((target: OpenTarget, options: OpenOptions = {}) => {
    const id = tabIdFor(target)

    setPanes((current) => {
      const paneId = options.paneId ?? activePaneIdRef.current
      return current.map((pane) => {
        if (pane.id !== paneId) return pane

        const existing = pane.tabs.findIndex((tab) => tab.id === id)

        // A graph tab already open just re-points at the new note — the same
        // view moving its focus, which is how Obsidian's graph behaves.
        if (existing !== -1) {
          const tabs = pane.tabs.slice()
          if (target.kind === 'graph') {
            tabs[existing] = {
              ...tabs[existing],
              slug: target.slug,
              title: fallbackTitle(target),
            }
          }
          return { ...pane, tabs, activeId: id }
        }

        const tab: Tab = {
          id,
          kind: target.kind,
          slug: target.kind === 'explore' ? undefined : target.slug,
          title: fallbackTitle(target),
        }

        const activeIndex = pane.tabs.findIndex((t) => t.id === pane.activeId)
        const active = activeIndex === -1 ? null : pane.tabs[activeIndex]

        // Default: browsing notes reuses the current note tab, so clicking
        // through a folder does not leave twenty tabs behind. ⌘-click opts out.
        const replace =
          !options.newTab && target.kind === 'note' && active?.kind === 'note'

        const tabs = pane.tabs.slice()
        if (replace) tabs.splice(activeIndex, 1, tab)
        else tabs.splice(activeIndex === -1 ? tabs.length : activeIndex + 1, 0, tab)

        return { ...pane, tabs, activeId: id }
      })
    })

    setActivePaneId(options.paneId ?? activePaneIdRef.current)
  }, [])

  const selectTab = useCallback((paneId: string, tabId: string) => {
    setPanes((current) =>
      current.map((pane) => (pane.id === paneId ? { ...pane, activeId: tabId } : pane)),
    )
    setActivePaneId(paneId)
  }, [])

  const closeTab = useCallback((paneId: string, tabId: string) => {
    setPanes((current) => {
      const next = current.map((pane) => {
        if (pane.id !== paneId) return pane
        const index = pane.tabs.findIndex((tab) => tab.id === tabId)
        if (index === -1) return pane

        const tabs = pane.tabs.filter((tab) => tab.id !== tabId)
        // Focus falls to the neighbour on the right, then the left — the same
        // rule every tabbed editor uses, so it never feels arbitrary.
        const activeId =
          pane.activeId !== tabId
            ? pane.activeId
            : (tabs[index] ?? tabs[index - 1] ?? null)?.id ?? null

        return { ...pane, tabs, activeId }
      })

      // An emptied split pane closes itself; the last pane stays and shows its
      // own empty state, because there would be nothing left to look at.
      const survivors = next.filter((pane) => pane.tabs.length > 0)
      if (next.length > 1 && survivors.length >= 1 && survivors.length < next.length) {
        setActivePaneId(survivors[0].id)
        return survivors
      }
      return next
    })
  }, [])

  const focusPane = useCallback((paneId: string) => setActivePaneId(paneId), [])

  const splitPane = useCallback(() => {
    setPanes((current) => {
      if (current.length > 1) return current

      const source = current[0]
      const active = source.tabs.find((tab) => tab.id === source.activeId)
      // The split defaults to the graph of whatever is open — the arrangement
      // in the reference screenshot, and the one that actually earns a second
      // pane: prose on the left, its neighbourhood on the right.
      const target: OpenTarget =
        active?.kind === 'note' && active.slug
          ? { kind: 'graph', slug: active.slug }
          : { kind: 'graph' }

      const tab: Tab = {
        id: tabIdFor(target),
        kind: 'graph',
        slug: target.kind === 'graph' ? target.slug : undefined,
        title: fallbackTitle(target),
      }

      const pane: Pane = { id: nextPaneId(), tabs: [tab], activeId: tab.id }
      setActivePaneId(pane.id)
      return [...current, pane]
    })
  }, [])

  const closePane = useCallback((paneId: string) => {
    setPanes((current) => {
      if (current.length < 2) return current
      const next = current.filter((pane) => pane.id !== paneId)
      setActivePaneId(next[0].id)
      return next
    })
  }, [])

  /* ---- creating ---- */

  const notify = useCallback((message: string) => setNotice(message), [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  /**
   * Create an empty note and open it.
   *
   * The title has to be unique because it is the slug, so a collision is
   * expected rather than exceptional: "Untitled" becomes "Untitled 2". The
   * loop is bounded so a pathological vault cannot spin.
   */
  const createNote = useCallback(
    async (folder?: string | null) => {
      for (let attempt = 0; attempt < 25; attempt++) {
        const title = attempt === 0 ? 'Untitled' : `Untitled ${attempt + 1}`
        try {
          const note = await apiFetch<Note>('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body: '', folder: folder ?? null }),
          })
          reloadVault()
          open({ kind: 'note', slug: note.slug, title: note.title }, { newTab: true })
          return
        } catch (err) {
          if (err instanceof RequestError && err.code === 'CONFLICT') continue
          notify(`Couldn't create the note. ${toFailure(err).message}`)
          return
        }
      }
      notify("Couldn't find a free name for the new note. Try renaming an old one.")
    },
    [notify, open, reloadVault],
  )

  /* ---- deep links ---- */

  const activePane = panes.find((pane) => pane.id === activePaneId) ?? panes[0]
  const activeTab = activePane?.tabs.find((tab) => tab.id === activePane.activeId) ?? null

  /*
   * Re-read the index when the user moves to a different note.
   *
   * The note pane can rename a note, create one from an unresolved link, or
   * add a link that turns a stub real — none of which this provider can see.
   * Moving between notes is both the moment the sidebar needs to be right and
   * the moment a refresh is invisible, since `useApi` holds the old list on
   * screen while the new one loads.
   */
  const firstTabRef = useRef(true)
  useEffect(() => {
    if (firstTabRef.current) {
      firstTabRef.current = false
      return
    }
    reloadVault()
  }, [activeTab?.id, reloadVault])

  /*
   * Keep the address bar honest so a note can be shared or reloaded.
   *
   * A replace, not a push: the tab bar is the history the user actually thinks
   * in. And focusing the graph pane does *not* blank the URL — you have merely
   * looked at the map, not closed the note, so the link stays valid until the
   * last note tab is gone.
   */
  useEffect(() => {
    const anyNoteOpen = panes.some((pane) => pane.tabs.some((tab) => tab.kind === 'note'))

    const path =
      activeTab?.kind === 'note' && activeTab.slug
        ? `/note/${encodeURIComponent(activeTab.slug)}`
        : anyNoteOpen
          ? null
          : '/'

    if (path !== null && window.location.pathname !== path) {
      window.history.replaceState(null, '', path)
    }
  }, [activeTab, panes])

  const store: VaultStore = useMemo(
    () => ({
      panes,
      activePaneId,
      activeTab,
      open,
      closeTab,
      selectTab,
      focusPane,
      splitPane,
      closePane,
      splitRatio,
      setSplitRatio,
      sidebarPane,
      setSidebarPane,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      tagFilter,
      setTagFilter,
      quickOpen,
      setQuickOpen,
      vault,
      titleFor,
      summaryFor,
      createNote,
      notice,
      notify,
    }),
    [
      panes,
      activePaneId,
      activeTab,
      open,
      closeTab,
      selectTab,
      focusPane,
      splitPane,
      closePane,
      splitRatio,
      sidebarPane,
      sidebarCollapsed,
      toggleSidebar,
      sidebarWidth,
      setSidebarWidth,
      tagFilter,
      quickOpen,
      vault,
      titleFor,
      summaryFor,
      createNote,
      notice,
      notify,
    ],
  )

  return <VaultContext.Provider value={store}>{children}</VaultContext.Provider>
}

export { SIDEBAR_MIN, SIDEBAR_MAX }
