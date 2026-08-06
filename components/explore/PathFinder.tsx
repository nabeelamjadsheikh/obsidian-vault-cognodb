'use client'

/**
 * "How are these two notes connected?"
 *
 * The pane answers that question before anyone asks it. On first paint it picks
 * two notes from two *different* top-level folders at random and runs the
 * search itself, so the feature demonstrates what it is for instead of showing
 * an empty form. The pair is chosen from the live note list rather than
 * hardcoded, which means it keeps working when the vault changes.
 *
 * ── on waiting ────────────────────────────────────────────────────────────
 * `shortestPath` is fast when a route exists and slow when one does not: the
 * engine stops the moment it meets in the middle, but to answer *no* it has to
 * rule out every route up to eight steps first. On this vault a connected pair
 * comes back in well under a second and an unconnected pair takes over a
 * minute. That asymmetry drives three decisions here:
 *
 *  - Every search shows a "Stop searching" control from the first frame, so a
 *    long wait is never a trap.
 *  - After a few seconds the pane explains *why* it is still going, because an
 *    unexplained wait reads as a bug.
 *  - The opening demonstration gives each random pair only a short window. A
 *    pair that does not answer quickly is not an interesting demonstration, so
 *    it is dropped and another is drawn. That keeps the first thing you see
 *    fast and connected, without ever hiding a result the reader asked for.
 *
 * A search the reader asked for is answered exactly once and reported
 * honestly, including "no connection found", which is a real answer and not an
 * error.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NoteSummary, PathResult } from '@/lib/types'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui'
import { asExploreError, ExploreError, getJson, isAbort, useResource } from './fetching'
import { inferDirections, resolveDirections, type HopDirection } from './direction'
import { NotePicker, NotePickerSkeleton } from './NotePicker'
import { PathChain } from './PathChain'
import { isBridgeKind, KIND_NOUN } from './palette'

/** How many random pairs the opening demonstration will try before giving up. */
const SEED_ATTEMPTS = 4

/** How long the opening demonstration waits on one pair before drawing again. */
const SEED_PATIENCE_MS = 6_000

/** When to start explaining the wait on a search the reader asked for. */
const SLOW_AFTER_MS = 3_500

/** Backstop, so a wedged request can never leave a skeleton up forever. */
const GIVE_UP_MS = 150_000

type Outcome =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'stopped' }
  | { phase: 'ready'; result: PathResult | null; from: string; to: string }
  | { phase: 'error'; error: ExploreError }

/* --------------------------------------------------------- pair selection */

/** "Ideas/Systems" → "Ideas". Notes with no folder are not grouped. */
function topLevel(folder: string | null): string | null {
  if (!folder) return null
  const head = folder.split('/')[0]?.trim()
  return head ? head : null
}

function sample<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)] ?? null
}

/**
 * Two real notes from two different top-level folders.
 *
 * Different folders is the whole point: a pair from inside one folder is a
 * connection the folder tree already showed you. Stubs are excluded because a
 * stub has no body and reads as a dead end in the chain.
 */
function pickPair(notes: NoteSummary[]): [NoteSummary, NoteSummary] | null {
  const grouped = new Map<string, NoteSummary[]>()
  for (const note of notes) {
    if (note.stub) continue
    const folder = topLevel(note.folder)
    if (!folder) continue
    const bucket = grouped.get(folder)
    if (bucket) bucket.push(note)
    else grouped.set(folder, [note])
  }

  const folders = [...grouped.keys()]

  // Fall back to any two distinct notes when the vault has no folders at all.
  if (folders.length < 2) {
    const usable = notes.filter((n) => !n.stub)
    if (usable.length < 2) return null
    const first = sample(usable)
    const second = sample(usable.filter((n) => n.slug !== first?.slug))
    return first && second ? [first, second] : null
  }

  const fromFolder = sample(folders)
  const toFolder = sample(folders.filter((f) => f !== fromFolder))
  if (!fromFolder || !toFolder) return null

  const from = sample(grouped.get(fromFolder) ?? [])
  const to = sample(grouped.get(toFolder) ?? [])
  return from && to ? [from, to] : null
}

/* ------------------------------------------------------------------ timing */

/** A signal that aborts with `parent`, or after `ms`, whichever comes first. */
function deadline(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  const stop = () => controller.abort()
  const timer = window.setTimeout(stop, ms)
  parent.addEventListener('abort', stop, { once: true })
  if (parent.aborted) stop()

  return {
    signal: controller.signal,
    release() {
      window.clearTimeout(timer)
      parent.removeEventListener('abort', stop)
    },
  }
}

/* -------------------------------------------------------------- summaries */

/** Why this particular route is worth looking at, when it is. */
function bridgeSentence(result: PathResult): string | null {
  const bridges = result.chain.filter((step) => isBridgeKind(step.kind))
  if (bridges.length === 0) return null

  const named = bridges.map((step) => `${step.label} (${KIND_NOUN[step.kind]})`)
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`

  return `This route leaves your notes and passes through ${list} — the kind of connection a folder tree can never show you.`
}

/* ------------------------------------------------------------------- pane */

export interface PathFinderProps {
  onOpenNote?: (slug: string) => void
}

export function PathFinder({ onOpenNote }: PathFinderProps) {
  const { state: notesState, reload } = useResource<NoteSummary[]>('/api/notes')

  const [from, setFrom] = useState<NoteSummary | null>(null)
  const [to, setTo] = useState<NoteSummary | null>(null)
  const [outcome, setOutcome] = useState<Outcome>({ phase: 'idle' })
  const [directions, setDirections] = useState<HopDirection[]>([])
  const [slow, setSlow] = useState(false)

  /** Guards against a stale response overwriting a newer search. */
  const runRef = useRef(0)
  const seededRef = useRef(false)

  /**
   * The in-flight request, so starting a search cancels the previous one.
   *
   * Ownership sits in a ref rather than in an effect cleanup on purpose: under
   * StrictMode an effect is mounted, torn down and mounted again, and a
   * cleanup that aborted the opening search would leave the pane stuck on its
   * skeleton with `seededRef` already spent.
   */
  const flightRef = useRef<AbortController | null>(null)
  const timersRef = useRef<number[]>([])
  /** The run number that hit `GIVE_UP_MS`, so its abort reads as a timeout. */
  const timedOutRef = useRef(0)

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer)
    timersRef.current = []
  }, [])

  /** Start a run: cancel whatever came before, arm the two wait timers. */
  const begin = useCallback(
    (run: number): AbortSignal => {
      flightRef.current?.abort()
      clearTimers()
      setSlow(false)

      const controller = new AbortController()
      flightRef.current = controller

      timersRef.current.push(
        window.setTimeout(() => {
          if (runRef.current === run) setSlow(true)
        }, SLOW_AFTER_MS),
        window.setTimeout(() => {
          if (runRef.current !== run) return
          timedOutRef.current = run
          controller.abort()
        }, GIVE_UP_MS),
      )

      return controller.signal
    },
    [clearTimers],
  )

  /** End a run, whatever the reason. */
  const settle = useCallback(() => {
    clearTimers()
    setSlow(false)
  }, [clearTimers])

  useEffect(
    () => () => {
      flightRef.current?.abort()
      for (const timer of timersRef.current) window.clearTimeout(timer)
    },
    [],
  )

  const search = useCallback(
    async (a: NoteSummary, b: NoteSummary, signal: AbortSignal): Promise<PathResult | null> =>
      getJson<PathResult | null>(
        `/api/path?from=${encodeURIComponent(a.slug)}&to=${encodeURIComponent(b.slug)}`,
        signal,
      ),
    [],
  )

  /** Draw the arrowheads in, once the chain is already on screen. */
  const enhance = useCallback((result: PathResult, run: number, signal: AbortSignal) => {
    const seed = inferDirections(result)
    setDirections(seed)
    resolveDirections(result, seed, signal)
      .then((full) => {
        if (!signal.aborted && runRef.current === run) setDirections(full)
      })
      .catch(() => {
        // Undirected rules are a perfectly readable fallback.
      })
  }, [])

  /* -- a search the reader asked for ------------------------------------ */

  const runSearch = useCallback(
    (a: NoteSummary | null, b: NoteSummary | null) => {
      if (!a || !b) return
      const run = ++runRef.current
      const signal = begin(run)
      setOutcome({ phase: 'searching' })
      setDirections([])

      search(a, b, signal)
        .then((result) => {
          if (runRef.current !== run) return
          settle()
          setOutcome({ phase: 'ready', result, from: a.title, to: b.title })
          if (result) enhance(result, run, signal)
        })
        .catch((cause: unknown) => {
          if (runRef.current !== run) return
          settle()
          if (isAbort(cause)) {
            if (timedOutRef.current !== run) return
            setOutcome({
              phase: 'error',
              error: new ExploreError(
                'DB_TIMEOUT',
                'The vault is still working on this one. Try a different pair, or give it another go.',
              ),
            })
            return
          }
          setOutcome({ phase: 'error', error: asExploreError(cause) })
        })
    },
    [search, enhance, begin, settle],
  )

  /* -- the opening demonstration ---------------------------------------- */

  const demonstrate = useCallback(
    (notes: NoteSummary[]) => {
      const run = ++runRef.current
      const signal = begin(run)
      setOutcome({ phase: 'searching' })
      setDirections([])

      void (async () => {
        for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
          const pair = pickPair(notes)
          if (!pair) break

          const [a, b] = pair
          if (signal.aborted || runRef.current !== run) return
          setFrom(a)
          setTo(b)

          // Each draw gets a short window. A pair that does not answer fast is
          // not a good demonstration, so it is dropped rather than waited on.
          const gate = deadline(signal, SEED_PATIENCE_MS)
          try {
            const result = await search(a, b, gate.signal)
            if (signal.aborted || runRef.current !== run) return

            // Keep drawing until a connected pair turns up, so the pane opens
            // on a demonstration rather than on a dead end.
            if (!result && attempt < SEED_ATTEMPTS - 1) continue

            settle()
            setOutcome({ phase: 'ready', result, from: a.title, to: b.title })
            if (result) enhance(result, run, signal)
            return
          } catch (cause) {
            if (signal.aborted || runRef.current !== run) return
            if (isAbort(cause)) continue // ran out of patience; draw again
            settle()
            setOutcome({ phase: 'error', error: asExploreError(cause) })
            return
          } finally {
            gate.release()
          }
        }

        // Nothing quick and connected turned up. Hand the pane over rather
        // than sitting on a skeleton.
        if (runRef.current !== run) return
        settle()
        setOutcome({ phase: 'idle' })
      })()
    },
    [search, enhance, begin, settle],
  )

  useEffect(() => {
    if (notesState.phase !== 'ready' || seededRef.current) return
    if (notesState.data.length < 2) return
    seededRef.current = true
    demonstrate(notesState.data)
  }, [notesState, demonstrate])

  const shuffle = useCallback(() => {
    if (notesState.phase !== 'ready') return
    demonstrate(notesState.data)
  }, [notesState, demonstrate])

  const stop = useCallback(() => {
    runRef.current += 1 // invalidate whatever is in flight
    flightRef.current?.abort()
    settle()
    setOutcome({ phase: 'stopped' })
  }, [settle])

  /* -- the corpus itself can fail --------------------------------------- */

  if (notesState.phase === 'loading') {
    return (
      <div className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <NotePickerSkeleton label="From" />
          <NotePickerSkeleton label="To" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton width="8.5rem" height="2.1rem" rounded="sm" />
          <Skeleton width="6rem" height="2.1rem" rounded="sm" />
        </div>
      </div>
    )
  }

  if (notesState.phase === 'error') {
    return (
      <ErrorState
        code={notesState.error.code}
        message={notesState.error.message}
        onRetry={reload}
        size="compact"
        className="rounded-panel border border-border bg-surface"
      />
    )
  }

  const notes = notesState.data
  const busy = outcome.phase === 'searching'

  return (
    <div className="flex flex-col gap-4">
      {/* controls */}
      <div className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <NotePicker label="From" notes={notes} value={from} onChange={setFrom} />

          <button
            type="button"
            title="Swap the two notes"
            onClick={() => {
              setFrom(to)
              setTo(from)
            }}
            disabled={!from || !to}
            className="mx-auto flex size-8 shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface-alt text-text-muted transition-colors hover:border-accent-dim hover:text-accent disabled:cursor-not-allowed disabled:text-text-faint sm:mx-0 sm:mb-1"
          >
            <span className="sr-only">Swap the two notes</span>
            <svg
              viewBox="0 0 24 24"
              width={15}
              height={15}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              focusable="false"
            >
              <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
            </svg>
          </button>

          <NotePicker label="To" notes={notes} value={to} onChange={setTo} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runSearch(from, to)}
            disabled={!from || !to || busy}
            className="rounded-[4px] bg-accent px-3.5 py-2 text-ui font-medium text-bg transition-[filter,background-color] hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-faint"
          >
            {busy ? 'Searching…' : 'Find connection'}
          </button>

          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-[4px] border border-border bg-surface-alt px-3 py-2 text-ui text-text-muted transition-colors hover:border-accent-dim hover:text-accent"
            >
              Stop searching
            </button>
          ) : (
            <button
              type="button"
              onClick={shuffle}
              className="rounded-[4px] border border-border bg-surface-alt px-3 py-2 text-ui text-text-muted transition-colors hover:border-accent-dim hover:text-accent"
            >
              Surprise me
            </button>
          )}

          <p className="text-[11px] text-text-faint">
            Follows links, citations, mentions and authorship, up to 8 steps.
          </p>
        </div>
      </div>

      {/* result */}
      <PathOutcome
        outcome={outcome}
        directions={directions}
        slow={slow}
        onOpenNote={onOpenNote}
        onRetry={() => runSearch(from, to)}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- outcome */

function PathOutcome({
  outcome,
  directions,
  slow,
  onOpenNote,
  onRetry,
}: {
  outcome: Outcome
  directions: HopDirection[]
  slow: boolean
  onOpenNote?: (slug: string) => void
  onRetry: () => void
}) {
  if (outcome.phase === 'idle') {
    return (
      <EmptyState
        icon="graph"
        message="Pick two notes to see how they connect"
        hint="Any two notes in the vault. The search walks links, citations and shared authors to find the shortest route between them."
        size="compact"
        className="rounded-panel border border-dashed border-border"
      />
    )
  }

  if (outcome.phase === 'stopped') {
    return (
      <EmptyState
        icon="graph"
        message="Search stopped"
        hint="Nothing was lost. Press Find connection to run it again, or pick a different pair."
        size="compact"
        className="rounded-panel border border-dashed border-border"
      />
    )
  }

  if (outcome.phase === 'searching') {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Searching for a connection">
        <Skeleton width="12rem" height="1.4rem" />
        <div className="flex items-center gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex shrink-0 items-center gap-3">
              {i > 0 ? <Skeleton width="3.5rem" height="0.5rem" /> : null}
              <Skeleton width="9.75rem" height="4.25rem" rounded="md" />
            </div>
          ))}
        </div>
        {slow ? (
          <p className="max-w-2xl text-ui text-text-muted">
            Still searching. Ruling a connection <em>out</em> is the slow case — the vault has to
            try every route up to 8 steps before it can say there is none.
          </p>
        ) : null}
      </div>
    )
  }

  if (outcome.phase === 'error') {
    return (
      <ErrorState
        code={outcome.error.code}
        message={outcome.error.message}
        onRetry={onRetry}
        size="compact"
        className="rounded-panel border border-border bg-surface"
      />
    )
  }

  const { result } = outcome

  // Not an error: two unrelated corners of a vault genuinely have no route.
  if (!result) {
    return (
      <EmptyState
        icon="graph"
        message="No connection found within 8 hops"
        hint={`“${outcome.from}” and “${outcome.to}” sit in separate corners of the vault. Link one to the other, or try another pair.`}
        size="compact"
        className="rounded-panel border border-dashed border-border"
      />
    )
  }

  if (result.distance === 0) {
    return (
      <EmptyState
        icon="graph"
        message="That's the same note on both sides"
        hint="Zero hops — trivially connected. Pick a second, different note to see a real route."
        size="compact"
        className="rounded-panel border border-dashed border-border"
      />
    )
  }

  const bridge = bridgeSentence(result)

  return (
    <section className="flex flex-col gap-3" aria-label="Connection found">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-text">
          Connected in {result.distance} {result.distance === 1 ? 'hop' : 'hops'}
        </h3>
        <p className="max-w-3xl text-ui text-text-muted">
          {bridge ??
            'Every step is one note linking straight to the next — no detour through a person or a source.'}
        </p>
      </div>

      <PathChain result={result} directions={directions} onOpenNote={onOpenNote} />
    </section>
  )
}

export default PathFinder
