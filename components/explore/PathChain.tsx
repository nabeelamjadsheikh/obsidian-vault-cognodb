'use client'

/**
 * The answer, drawn as a breadcrumb.
 *
 *   [Attention Is a Moral Act] ──LINKS_TO──▸ [The Attention Economy]
 *   ──MENTIONS──▸ [Donella Meadows] ◂──MENTIONS── [The Tragedy of the Commons]
 *
 * Every step is a card coloured by what it *is*, and the relationship is
 * printed on the rule between two cards rather than inside either of them,
 * because the relationship belongs to neither end.
 *
 * Person and Source steps are drawn loudest on purpose. A chain that leaves the
 * notes and passes through an author is the one result a folder tree could
 * never have produced, so the pane should make that visible from across the
 * room rather than hide it in a uniform row of grey boxes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeKind, PathResult, PathStep } from '@/lib/types'
import { spokenChain, spokenHop, type HopDirection } from './direction'
import { fade, isBridgeKind, KIND_COLOUR, KIND_NOUN, tint } from './palette'

export interface PathChainProps {
  result: PathResult
  directions: HopDirection[]
  onOpenNote?: (slug: string) => void
}

/* ------------------------------------------------------------------ glyphs */

/** A small mark inside each non-note card, so kind survives greyscale. */
function KindGlyph({ kind, label }: { kind: NodeKind; label: string }) {
  const colour = KIND_COLOUR[kind]

  if (kind === 'Person') {
    const initials = label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('')

    return (
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold tracking-tight"
        style={{ backgroundColor: fade(colour, 22), color: colour }}
      >
        {initials || '?'}
      </span>
    )
  }

  if (kind === 'Source') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={16}
        height={16}
        fill="none"
        stroke={colour}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden
        focusable="false"
      >
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a3 3 0 0 1 2 5.2V20a3 3 0 0 0-2-.8H5.5A1.5 1.5 0 0 1 4 17.7Z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a3 3 0 0 0-2 5.2V20a3 3 0 0 1 2-.8h4.5a1.5 1.5 0 0 0 1.5-1.5Z" />
      </svg>
    )
  }

  if (kind === 'Tag') {
    return (
      <span aria-hidden className="shrink-0 text-sm font-semibold" style={{ color: colour }}>
        #
      </span>
    )
  }

  return null
}

/** The arrowhead on a connector. */
function Arrow({ pointing, muted }: { pointing: 'left' | 'right'; muted: boolean }) {
  return (
    <svg
      viewBox="0 0 8 10"
      width={7}
      height={9}
      className={`shrink-0 ${muted ? 'text-border' : 'text-text-muted'}`}
      aria-hidden
      focusable="false"
    >
      <path
        d={pointing === 'right' ? 'M0 0 8 5 0 10Z' : 'M8 0 0 5 8 10Z'}
        fill="currentColor"
      />
    </svg>
  )
}

/* -------------------------------------------------------------- connector */

function Connector({ rel, direction }: { rel: string; direction: HopDirection }) {
  const known = direction !== 'unknown'
  const left = direction === 'backward' || direction === 'both'
  const right = direction === 'forward' || direction === 'both'

  return (
    <span
      aria-hidden
      className="flex shrink-0 select-none items-center gap-1 px-1 sm:px-1.5"
      title={known ? undefined : 'Direction not established'}
    >
      {left ? <Arrow pointing="left" muted={false} /> : null}
      <span className="h-px w-2.5 bg-border sm:w-4" />
      <span
        className={`whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.1em] ${
          known ? 'text-text-muted' : 'text-text-faint'
        }`}
      >
        {rel}
      </span>
      <span className="h-px w-2.5 bg-border sm:w-4" />
      {right ? <Arrow pointing="right" muted={false} /> : null}
      {!left && !right ? <span className="h-px w-1.5 bg-border" /> : null}
    </span>
  )
}

/* ------------------------------------------------------------- step cards */

function StepCard({
  step,
  onOpenNote,
}: {
  step: PathStep
  onOpenNote?: (slug: string) => void
}) {
  const colour = KIND_COLOUR[step.kind]
  const bridge = isBridgeKind(step.kind)
  const openable = step.kind === 'Note' && Boolean(step.slug) && Boolean(onOpenNote)

  const body = (
    <>
      {step.kind === 'Note' ? null : (
        <span className="flex items-center gap-1.5">
          <KindGlyph kind={step.kind} label={step.label} />
          <span
            className="text-[9.5px] font-medium uppercase tracking-[0.09em]"
            style={{ color: colour }}
          >
            {KIND_NOUN[step.kind]}
          </span>
        </span>
      )}

      <span
        className="line-clamp-3 text-ui font-medium leading-snug"
        style={{ color: bridge ? colour : undefined }}
      >
        {step.label}
      </span>

      {openable ? (
        <span className="text-[10px] text-text-faint transition-colors group-hover:text-accent">
          Open note
        </span>
      ) : null}
    </>
  )

  const shell = [
    'group flex w-[9.75rem] shrink-0 flex-col gap-1.5 rounded-panel border px-3 py-2.5 text-left transition-colors sm:w-[10.75rem]',
    bridge ? 'border-l-[3px]' : '',
    openable ? 'cursor-pointer hover:border-accent-dim' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const style = bridge
    ? { backgroundColor: tint(colour, 12), borderColor: fade(colour, 40) }
    : undefined

  if (openable) {
    return (
      <button
        type="button"
        onClick={() => onOpenNote?.(step.slug as string)}
        className={`${shell} border-border bg-surface text-text hover:text-accent`}
      >
        {body}
      </button>
    )
  }

  return (
    <div
      className={`${shell} ${bridge ? '' : 'border-border bg-surface text-text'}`}
      style={style}
    >
      {body}
    </div>
  )
}

/* ------------------------------------------------------------------ chain */

export function PathChain({ result, directions, onOpenNote }: PathChainProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [copied, setCopied] = useState(false)

  // The chain is often wider than the pane; say so rather than letting the
  // last step silently fall off the right edge.
  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth + 4)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [result])

  const sentence = spokenChain(result, directions)

  const copy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(sentence)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      } catch {
        // Clipboard access can be refused; the chain is still on screen, so
        // there is nothing worth interrupting the reader about.
      }
    })()
  }, [sentence])

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="overflow-x-auto pb-2"
        tabIndex={0}
        role="group"
        aria-label="Connection path"
      >
        <ol className="flex w-max items-stretch">
          {result.chain.map((step, index) => {
            const rel = index > 0 ? result.hops[index - 1] : null
            const direction = index > 0 ? (directions[index - 1] ?? 'unknown') : 'unknown'

            return (
              <li key={`${step.kind}:${step.slug ?? step.label}:${index}`} className="flex items-center">
                {rel ? (
                  <>
                    <span className="sr-only">{spokenHop(rel, direction)}</span>
                    <Connector rel={rel} direction={direction} />
                  </>
                ) : null}
                <StepCard step={step} onOpenNote={onOpenNote} />
              </li>
            )
          })}
        </ol>
      </div>

      {overflowing ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent"
        />
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {overflowing ? (
          <p className="text-[11px] text-text-faint">Scroll sideways to follow the whole chain.</p>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="text-[11px] text-text-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-accent"
        >
          {copied ? 'Copied' : 'Copy this path as a sentence'}
        </button>
      </div>
    </div>
  )
}

export default PathChain
