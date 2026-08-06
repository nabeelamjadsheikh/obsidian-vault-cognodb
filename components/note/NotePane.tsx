'use client'

/**
 * The note pane: read a note, edit it, and see what it is connected to.
 *
 * The one idea this file is built around is that the connections are *live*.
 * Typing `[[Deliberate Practice]]` and saving does not just change text — it
 * adds an edge, which means the other note's backlinks panel now contains this
 * one, and this note's suggestions may lose a row. So every successful save
 * bumps `graphVersion`, and the panels below re-query. Without that the vault
 * would look like a text editor that happens to store files in a database.
 *
 * Fetching, saving and mode live here; rendering is delegated. The pane never
 * shows a raw error: every failure arrives as `{ code, message }` and is drawn
 * by ErrorState, full-size when the vault itself is unreachable and inline when
 * it is just this request.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { EmptyState, ErrorState, Skeleton, SkeletonText } from '@/components/ui'
import { NoteMarkdown } from '@/lib/markdown'
import { isDatabaseError, type Note, type Suggestion } from '@/lib/types'
import { parseBody, slugify } from '@/lib/wikilink'

import { BacklinksPanel } from './BacklinksPanel'
import { NoteEditor } from './NoteEditor'
import { NoteHeader } from './NoteHeader'
import { SuggestedPanel } from './SuggestedPanel'
import { Kbd, useModifierKey } from './parts'
import { saveNote, toProblem, useResource, useVaultSlugs, type Problem } from './api'

/* ------------------------------------------------------------------ shell */

/** One column, one measure, one place to change the note's page geometry. */
function Column({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[46rem] px-6 pb-16 pt-8 sm:px-8">{children}</div>
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[46rem] items-center justify-between gap-3 px-6 py-2 sm:px-8">
        {children}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- statuses */

type SaveState =
  | { kind: 'clean' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; problem: Problem }

/**
 * The save indicator.
 *
 * Quiet by design: it says something only when there is something to say, and
 * "Saved" fades after a moment. A permanent green tick trains people to stop
 * reading it, which is exactly when you need them to notice "Unsaved".
 */
function SaveIndicator({ state, dirty }: { state: SaveState; dirty: boolean }) {
  if (state.kind === 'saving') {
    return <span className="text-[11px] text-text-faint">Saving…</span>
  }
  if (state.kind === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-accent">
        <svg
          viewBox="0 0 24 24"
          width={12}
          height={12}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          focusable="false"
        >
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
        Saved
      </span>
    )
  }
  if (state.kind === 'failed') {
    return <span className="text-[11px] text-text-muted">Not saved</span>
  }
  if (dirty) {
    return <span className="text-[11px] text-text-faint">Unsaved changes</span>
  }
  return null
}

/* --------------------------------------------------------------- document */

/** Turn `the-garden-and-the-stream` back into something a person would title. */
function titleFromSlug(slug: string): string {
  const words = decodeURIComponent(slug).replace(/-+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled'
}

/**
 * Append `[[Title]]` to a body, merging into a trailing "See also" line when
 * there is one.
 *
 * A bare `[[Title]]` dumped at the end would be a valid link with a useless
 * context sentence, and the context is what the *other* note's backlinks panel
 * shows. A real sentence there means accepting a suggestion produces prose
 * somebody can read later, not a footer of orphaned brackets.
 */
function appendLink(body: string, title: string): string {
  const trimmed = body.replace(/\s+$/, '')
  if (!trimmed) return `See also [[${title}]].\n`

  const lines = trimmed.split('\n')
  const last = lines[lines.length - 1]
  if (/^See also \[\[.+\]\][^\n]*\.$/.test(last)) {
    lines[lines.length - 1] = `${last.slice(0, -1)}, [[${title}]].`
    return `${lines.join('\n')}\n`
  }

  return `${trimmed}\n\nSee also [[${title}]].\n`
}

function NoteDocument({ initial }: { initial: Note }) {
  const [note, setNote] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draftBody, setDraftBody] = useState(initial.body)
  const [draftTitle, setDraftTitle] = useState(initial.title)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'clean' })

  /**
   * Bumped on every successful save. Drives the backlinks and suggestion
   * panels *and* the resolved-slug set, because a new `[[link]]` can create a
   * stub note that other links in this very body point at.
   */
  const [graphVersion, setGraphVersion] = useState(0)

  const slugs = useVaultSlugs(graphVersion)
  const modifier = useModifierKey()

  // A save in flight blocks another one: two PUTs racing on the same slug would
  // resolve in an arbitrary order and the loser would silently win.
  const saving = useRef(false)

  const dirty = draftBody !== note.body || draftTitle.trim() !== note.title

  // Live while editing so the counter responds to typing; the stored figure
  // otherwise, which is the one the rest of the vault agrees on.
  const wordCount = useMemo(
    () => (editing ? parseBody(draftBody).wordCount : note.wordCount),
    [editing, draftBody, note.wordCount],
  )

  /** Save, and report whether it landed. Never throws at a caller. */
  const save = useCallback(
    async (body: string, title: string): Promise<boolean> => {
      if (saving.current) return false

      const nextTitle = title.trim() || note.title
      if (body === note.body && nextTitle === note.title) {
        setSaveState({ kind: 'clean' })
        return true
      }

      saving.current = true
      setSaveState({ kind: 'saving' })
      try {
        const saved = await saveNote(note.slug, {
          title: nextTitle,
          body,
          folder: note.folder,
        })
        setNote(saved)
        // The server trims and normalises; adopt its version so the editor and
        // the vault cannot disagree about what was written.
        setDraftBody(saved.body)
        setDraftTitle(saved.title)
        setSaveState({ kind: 'saved' })
        setGraphVersion((v) => v + 1)
        return true
      } catch (error) {
        setSaveState({ kind: 'failed', problem: toProblem(error) })
        return false
      } finally {
        saving.current = false
      }
    },
    [note.slug, note.title, note.body, note.folder],
  )

  // "Saved" is an acknowledgement, not a state. Let it go.
  useEffect(() => {
    if (saveState.kind !== 'saved') return
    const timer = window.setTimeout(() => setSaveState({ kind: 'clean' }), 2200)
    return () => window.clearTimeout(timer)
  }, [saveState])

  const toggleMode = useCallback(async () => {
    if (!editing) {
      setEditing(true)
      return
    }
    // Failing to save must not drop the reader back into a reading view showing
    // the *old* text while their edit exists only in a state variable.
    const ok = await save(draftBody, draftTitle)
    if (ok) setEditing(false)
  }, [editing, save, draftBody, draftTitle])

  // ⌘E / Ctrl-E toggles, ⌘S / Ctrl-S saves. Bound on the window so they work
  // from inside the textarea too, where the browser's own Save dialog lives.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()

      if (key === 'e') {
        event.preventDefault()
        void toggleMode()
      } else if (key === 's') {
        event.preventDefault()
        void save(draftBody, draftTitle)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleMode, save, draftBody, draftTitle])

  // Closing the tab mid-edit should cost a confirmation, not a paragraph.
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const acceptSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      const next = appendLink(draftBody, suggestion.title)
      setDraftBody(next)
      const ok = await save(next, draftTitle)
      // Roll the optimistic body back if the vault refused it, so the editor is
      // never showing a link that was not written.
      if (!ok) setDraftBody(draftBody)
    },
    [draftBody, draftTitle, save],
  )

  const empty = !editing && draftBody.trim() === ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar>
        <span className="text-[11px] uppercase tracking-[0.08em] text-text-faint">
          {editing ? 'Editing' : 'Reading'}
        </span>

        <div className="flex items-center gap-3">
          <SaveIndicator state={saveState} dirty={dirty} />

          <button
            type="button"
            onClick={() => void toggleMode()}
            aria-pressed={editing}
            className="flex items-center gap-2 rounded-[4px] border border-border bg-surface px-2.5 py-1 text-ui text-text-muted transition-colors hover:border-accent-dim hover:text-accent"
          >
            {editing ? 'Done' : 'Edit'}
            <Kbd>{modifier}E</Kbd>
          </button>
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Column>
          <NoteHeader
            note={note}
            editing={editing}
            draftTitle={draftTitle}
            onTitleChange={setDraftTitle}
            wordCount={wordCount}
          />

          {saveState.kind === 'failed' ? (
            <ErrorState
              code={saveState.problem.code}
              message={`${saveState.problem.message} Your text is still here — try saving again.`}
              onRetry={() => void save(draftBody, draftTitle)}
              size="compact"
              className="mb-4"
            />
          ) : null}

          {editing ? (
            <NoteEditor
              value={draftBody}
              onChange={setDraftBody}
              onBlur={() => void save(draftBody, draftTitle)}
              autoFocus
            />
          ) : empty ? (
            <EmptyState
              icon="new-note"
              message={
                note.stub
                  ? 'This note is linked from elsewhere but has not been written yet.'
                  : 'This note is empty.'
              }
              hint="Everything you write here becomes part of the graph — links, tags and all."
              action={{ label: 'Start writing', onClick: () => setEditing(true) }}
            />
          ) : (
            <NoteMarkdown body={draftBody} existingSlugs={slugs} />
          )}

          <div className="mt-12">
            <BacklinksPanel slug={note.slug} title={note.title} version={graphVersion} />
            <SuggestedPanel
              slug={note.slug}
              version={graphVersion}
              onLink={acceptSuggestion}
              disabled={saveState.kind === 'saving'}
            />
          </div>
        </Column>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ missing note */

/**
 * A slug with nothing behind it — almost always an unresolved `[[wikilink]]`
 * somebody just clicked.
 *
 * In Obsidian that click *is* how you create the note, so this offers exactly
 * that instead of an error. PUT creates the note when the slug is free, which
 * means no separate create endpoint and no chance of the title drifting from
 * the slug the link pointed at.
 */
function MissingNote({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const [creating, setCreating] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const title = titleFromSlug(slug)

  async function create() {
    setCreating(true)
    setProblem(null)
    try {
      await saveNote(slug, { title, body: '' })
      onCreated()
    } catch (error) {
      setProblem(toProblem(error))
      setCreating(false)
    }
  }

  return (
    <Column>
      <EmptyState
        icon="new-note"
        message={`“${title}” hasn't been written yet.`}
        hint={
          slugify(title) === slug
            ? 'Nothing has been written here yet. Create it and any link pointing here stops being a dead end.'
            : 'This address does not match any note in the vault.'
        }
        action={{ label: creating ? 'Creating…' : 'Create this note', onClick: () => void create() }}
      />

      {problem ? (
        <ErrorState code={problem.code} message={problem.message} size="compact" />
      ) : null}
    </Column>
  )
}

/* ------------------------------------------------------------------- pane */

/** The loading view keeps the finished layout's shape so nothing jumps. */
function NoteSkeleton() {
  return (
    <Column>
      <div className="mb-7 flex flex-col gap-3" role="status" aria-label="Loading note">
        <Skeleton width="18%" height="0.7rem" />
        <Skeleton width="62%" height="1.9rem" />
        <Skeleton width="30%" height="0.7rem" />
        <div className="flex gap-2">
          <Skeleton width="72px" height="1.1rem" rounded="full" />
          <Skeleton width="88px" height="1.1rem" rounded="full" />
        </div>
      </div>
      <SkeletonText lines={4} />
      <div className="mt-8">
        <SkeletonText lines={5} />
      </div>
    </Column>
  )
}

export interface NotePaneProps {
  slug: string
}

export function NotePane({ slug }: NotePaneProps) {
  // Bumped when a missing note is created, to re-fetch the slug that now exists.
  const [version, setVersion] = useState(0)
  const { resource, retry, retrying } = useResource<Note>(
    `/api/notes/${encodeURIComponent(slug)}`,
    version,
  )

  if (resource.status === 'loading') return <NoteSkeleton />

  if (resource.status === 'failed') {
    if (resource.problem.code === 'NOT_FOUND') {
      return <MissingNote slug={slug} onCreated={() => setVersion((v) => v + 1)} />
    }
    return (
      <ErrorState
        code={resource.problem.code}
        message={resource.problem.message}
        onRetry={retry}
        retrying={retrying}
        size={isDatabaseError(resource.problem.code) ? 'full' : 'compact'}
      />
    )
  }

  // Keyed on the slug so switching notes resets every draft, mode and panel
  // rather than carrying one note's unsaved text into another.
  return <NoteDocument key={resource.data.slug} initial={resource.data} />
}

export default NotePane
