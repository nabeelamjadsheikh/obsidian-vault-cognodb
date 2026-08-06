'use client'

/**
 * The folder tree.
 *
 * `/api/tree` returns a flat list of folder paths and `/api/notes` returns
 * notes carrying `folder` as a path string — so the nesting is reconstructed
 * here rather than requested. That is deliberate: two flat, cacheable requests
 * beat one recursive query, and it means the tree can be re-derived instantly
 * when a tag filter narrows the note list.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon, EmptyState, Skeleton } from '@/components/ui'
import type { NoteSummary } from '@/lib/types'
import { useVault } from '@/components/shell/VaultProvider'

interface Dir {
  path: string
  name: string
  children: Dir[]
  notes: NoteSummary[]
}

const FOLDER_STORAGE_KEY = 'vault:open-folders'

/** Depth indent. 13px per level is Obsidian's — enough to read, cheap in width. */
const INDENT = 13

function makeDir(path: string): Dir {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return { path, name, children: [], notes: [] }
}

/**
 * Fold folder paths and notes into a tree.
 *
 * Every ancestor segment is materialised even if `/api/tree` never listed it,
 * so a note filed under `Projects/Lantern` can never end up orphaned by a
 * missing intermediate folder.
 */
function buildTree(folderPaths: string[], notes: NoteSummary[]) {
  const dirs = new Map<string, Dir>()

  const ensure = (path: string): Dir => {
    const existing = dirs.get(path)
    if (existing) return existing

    const dir = makeDir(path)
    dirs.set(path, dir)

    const cut = path.lastIndexOf('/')
    if (cut !== -1) ensure(path.slice(0, cut)).children.push(dir)

    return dir
  }

  for (const path of folderPaths) ensure(path)

  const rootNotes: NoteSummary[] = []
  for (const note of notes) {
    if (!note.folder) rootNotes.push(note)
    else ensure(note.folder).notes.push(note)
  }

  const roots = [...dirs.values()].filter((dir) => !dir.path.includes('/'))

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  const byTitle = (a: NoteSummary, b: NoteSummary) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

  const sort = (dir: Dir) => {
    dir.children.sort(byName)
    dir.notes.sort(byTitle)
    dir.children.forEach(sort)
  }
  roots.sort(byName)
  roots.forEach(sort)

  return { roots, rootNotes: rootNotes.sort(byTitle) }
}

/** Total notes at or below a folder, for the count on the right of each row. */
function deepCount(dir: Dir): number {
  return dir.notes.length + dir.children.reduce((sum, child) => sum + deepCount(child), 0)
}

/* ------------------------------------------------------------------- rows */

function NoteRow({
  note,
  depth,
  active,
}: {
  note: NoteSummary
  depth: number
  active: boolean
}) {
  const { open } = useVault()

  return (
    <button
      type="button"
      // ⌘/Ctrl-click is the universal "open in a new tab"; plain click reuses
      // the current one so browsing a folder does not bury the tab bar.
      onClick={(event) => open({ kind: 'note', slug: note.slug, title: note.title }, {
        newTab: event.metaKey || event.ctrlKey,
      })}
      title={`${note.title}${note.stub ? ' — not written yet' : ''}\n⌘-click to open in a new tab`}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-center gap-1.5 rounded-[4px] py-[3px] pr-2 text-left text-ui transition-colors ${
        active
          ? 'bg-surface-alt text-text'
          : note.stub
            ? 'text-text-faint hover:bg-surface-alt/60 hover:text-text-muted'
            : 'text-text-muted hover:bg-surface-alt/60 hover:text-text'
      }`}
      style={{ paddingLeft: 8 + depth * INDENT + 18 }}
    >
      <span className="truncate">{note.title}</span>
      {note.stub ? (
        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-text-faint">
          stub
        </span>
      ) : null}
    </button>
  )
}

/** The same row, flattened: used while a tag filter is narrowing the list. */
function FilteredNoteRow({ note, active }: { note: NoteSummary; active: boolean }) {
  const { open } = useVault()

  return (
    <button
      type="button"
      onClick={(event) =>
        open(
          { kind: 'note', slug: note.slug, title: note.title },
          { newTab: event.metaKey || event.ctrlKey },
        )
      }
      title={note.title}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full flex-col items-start gap-0.5 rounded-[4px] px-2 py-1.5 text-left transition-colors ${
        active ? 'bg-surface-alt' : 'hover:bg-surface-alt/60'
      }`}
    >
      <span
        className={`w-full truncate text-ui ${
          note.stub ? 'text-text-faint' : active ? 'text-text' : 'text-text-muted'
        }`}
      >
        {note.title}
      </span>
      <span className="w-full truncate text-[11px] text-text-faint">
        {note.folder ?? 'Vault root'}
      </span>
    </button>
  )
}

function FolderRow({
  dir,
  depth,
  openFolders,
  toggle,
  activeSlug,
}: {
  dir: Dir
  depth: number
  openFolders: Set<string>
  toggle: (path: string) => void
  activeSlug: string | null
}) {
  const isOpen = openFolders.has(dir.path)
  const count = deepCount(dir)

  return (
    <li>
      <button
        type="button"
        onClick={() => toggle(dir.path)}
        aria-expanded={isOpen}
        className="group flex w-full items-center gap-1 rounded-[4px] py-[3px] pr-2 text-left text-ui text-text-muted transition-colors hover:bg-surface-alt/60 hover:text-text"
        style={{ paddingLeft: 4 + depth * INDENT }}
      >
        <Icon
          name="chevron-right"
          size={13}
          className={`shrink-0 text-text-faint transition-transform duration-150 group-hover:text-text-muted ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
        <Icon name="folder" size={14} className="shrink-0 text-text-faint" />
        <span className="truncate font-medium">{dir.name}</span>
        <span className="ml-auto shrink-0 pl-1 tabular-nums text-[11px] text-text-faint">
          {count}
        </span>
      </button>

      {isOpen ? (
        <ul>
          {dir.children.map((child) => (
            <FolderRow
              key={child.path}
              dir={child}
              depth={depth + 1}
              openFolders={openFolders}
              toggle={toggle}
              activeSlug={activeSlug}
            />
          ))}
          {dir.notes.map((note) => (
            <li key={note.slug}>
              <NoteRow note={note} depth={depth + 1} active={note.slug === activeSlug} />
            </li>
          ))}
          {dir.children.length === 0 && dir.notes.length === 0 ? (
            <li
              className="py-[3px] text-ui text-text-faint"
              style={{ paddingLeft: 8 + (depth + 1) * INDENT + 18 }}
            >
              Empty
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------ pane */

export function FileTree() {
  const { vault, activeTab, tagFilter, setTagFilter, createNote } = useVault()
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())

  const activeSlug = activeTab?.kind === 'note' ? (activeTab.slug ?? null) : null

  // Restore after mount, not during render, so server and client markup match.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FOLDER_STORAGE_KEY)
      if (raw) setOpenFolders(new Set(JSON.parse(raw) as string[]))
    } catch {
      /* Nothing remembered is a fine starting point. */
    }
  }, [])

  const persist = useCallback((next: Set<string>) => {
    try {
      window.localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      /* Storage being unavailable must never break the tree. */
    }
  }, [])

  const toggle = useCallback(
    (path: string) => {
      setOpenFolders((current) => {
        const next = new Set(current)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        persist(next)
        return next
      })
    },
    [persist],
  )

  // Reveal the open note: whatever you land on — a sidebar click, a backlink,
  // a graph node, a deep link — its folders unfold so you can see where it lives.
  useEffect(() => {
    if (!activeSlug) return
    const folder = vault.notes.find((note) => note.slug === activeSlug)?.folder
    if (!folder) return

    setOpenFolders((current) => {
      const next = new Set(current)
      const segments = folder.split('/')
      let path = ''
      let changed = false
      for (const segment of segments) {
        path = path ? `${path}/${segment}` : segment
        if (!next.has(path)) {
          next.add(path)
          changed = true
        }
      }
      if (!changed) return current
      persist(next)
      return next
    })
  }, [activeSlug, vault.notes, persist])

  const notes = useMemo(
    () => (tagFilter ? vault.notes.filter((note) => note.tags.includes(tagFilter)) : vault.notes),
    [vault.notes, tagFilter],
  )

  const { roots, rootNotes } = useMemo(
    () => buildTree(vault.folders.map((folder) => folder.path), notes),
    [vault.folders, notes],
  )

  const collapseAll = useCallback(() => {
    setOpenFolders(new Set())
    persist(new Set())
  }, [persist])

  if (vault.loading && vault.notes.length === 0) {
    return <FileTreeSkeleton />
  }

  if (vault.notes.length === 0) {
    return (
      <EmptyState
        icon="folder"
        message="This vault is empty"
        hint="Create your first note and it will appear here."
        action={{ label: 'New note', onClick: () => void createNote() }}
      />
    )
  }

  return (
    <div className="pb-8">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-3 pb-1.5 pt-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          Vault
        </h2>
        <span className="text-[11px] tabular-nums text-text-faint">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <button
          type="button"
          onClick={collapseAll}
          className="ml-auto rounded-[3px] px-1.5 py-0.5 text-[11px] text-text-faint transition-colors hover:bg-surface-alt hover:text-text-muted"
        >
          Collapse all
        </button>
      </div>

      {tagFilter ? (
        <div className="mx-2 mb-1.5 flex items-center gap-2 rounded-[4px] border border-accent-dim/50 bg-accent-dim/15 px-2 py-1.5">
          <Icon name="tag" size={12} className="shrink-0 text-accent" />
          <span className="truncate text-ui text-accent">#{tagFilter}</span>
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className="ml-auto shrink-0 text-[11px] text-text-muted transition-colors hover:text-text"
          >
            Clear
          </button>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          size="compact"
          icon="tag"
          message={`No notes tagged #${tagFilter}`}
          hint="Clear the filter to see the whole vault."
        />
      ) : tagFilter ? (
        // A filtered vault is a result set, not a hierarchy: showing it flat
        // (with each note's folder alongside) means the answer is visible
        // without unfolding anything.
        <ul className="px-1">
          {notes.map((note) => (
            <li key={note.slug}>
              <FilteredNoteRow note={note} active={note.slug === activeSlug} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="px-1">
          {roots.map((dir) => (
            <FolderRow
              key={dir.path}
              dir={dir}
              depth={0}
              openFolders={openFolders}
              toggle={toggle}
              activeSlug={activeSlug}
            />
          ))}
          {rootNotes.map((note) => (
            <li key={note.slug}>
              <NoteRow note={note} depth={0} active={note.slug === activeSlug} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Loading: rows of the same height and rhythm, so nothing jumps when data lands. */
export function FileTreeSkeleton() {
  const widths = ['62%', '78%', '48%', '70%', '55%', '84%', '60%', '72%', '50%', '66%']

  return (
    <div className="flex flex-col gap-2 px-3 pt-3" role="status" aria-label="Loading the vault">
      {widths.map((width, index) => (
        <div key={index} className="flex items-center gap-2" style={{ paddingLeft: (index % 3) * 12 }}>
          <Skeleton width={12} height={12} rounded="sm" />
          <Skeleton width={width} height={11} />
        </div>
      ))}
    </div>
  )
}

export default FileTree
