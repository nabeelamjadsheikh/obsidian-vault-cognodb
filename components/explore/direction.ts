'use client'

/**
 * Which way does each hop in a path point?
 *
 * `PathResult` gives an ordered chain and an ordered list of relationship
 * types, but `shortestPath` traverses undirected, so the API cannot say whether
 * hop *n* ran with the arrow or against it. The breadcrumb needs that: reading
 * "Donella Meadows --MENTIONS--> The Tragedy of the Commons" backwards is a
 * factual error, not a cosmetic one.
 *
 * Two passes recover it without touching the query layer.
 *
 * Pass 1 — the schema. Every relationship in this vault has fixed endpoints:
 * MENTIONS runs Note→Person, CITES runs Note→Source, AUTHORED_BY runs
 * Source→Person. Whenever a hop joins two *different* kinds, comparing the
 * step kinds against that table settles the direction with no network at all.
 * This resolves every hop except one case.
 *
 * Pass 2 — the exception. LINKS_TO joins Note to Note, so the kinds are
 * identical and the schema says nothing. Those are resolved against the
 * backlinks endpoint, which is exactly the "who points at me" question:
 * if A appears in B's backlinks the hop runs forward. Both directions are
 * asked in parallel, because a mutual link is a real and pleasing answer.
 *
 * Pass 2 is a progressive enhancement. It runs after the chain is already on
 * screen, each hop starts as `unknown` and renders a plain undirected rule, and
 * any failure simply leaves it that way. A slow or missing backlinks response
 * must never stop the path from being shown.
 */

import type { Backlink, NodeKind, PathResult, RelType } from '@/lib/types'
import { getJson, isAbort } from './fetching'

export type HopDirection =
  /** Chain order matches the arrow: step n → step n+1. */
  | 'forward'
  /** The arrow runs against chain order: step n ← step n+1. */
  | 'backward'
  /** They link to each other. */
  | 'both'
  /** Not established — rendered as a plain rule with no arrowhead. */
  | 'unknown'

/** The declared endpoints of every relationship type in the vault. */
const SCHEMA: Record<RelType, { from: NodeKind; to: NodeKind }> = {
  LINKS_TO: { from: 'Note', to: 'Note' },
  TAGGED: { from: 'Note', to: 'Tag' },
  IN_FOLDER: { from: 'Note', to: 'Folder' },
  CHILD_OF: { from: 'Folder', to: 'Folder' },
  MENTIONS: { from: 'Note', to: 'Person' },
  CITES: { from: 'Note', to: 'Source' },
  AUTHORED_BY: { from: 'Source', to: 'Person' },
}

/** Human phrasing for each hop, used in the screen-reader reading of a chain. */
const SPOKEN: Record<RelType, { forward: string; backward: string }> = {
  LINKS_TO: { forward: 'links to', backward: 'is linked to from' },
  TAGGED: { forward: 'is tagged', backward: 'tags' },
  IN_FOLDER: { forward: 'sits in', backward: 'contains' },
  CHILD_OF: { forward: 'is inside', backward: 'contains' },
  MENTIONS: { forward: 'mentions', backward: 'is mentioned by' },
  CITES: { forward: 'cites', backward: 'is cited by' },
  AUTHORED_BY: { forward: 'was written by', backward: 'wrote' },
}

/** Pass 1: everything the schema alone can settle. Never touches the network. */
export function inferDirections(result: PathResult): HopDirection[] {
  return result.hops.map((rel, index) => {
    const left = result.chain[index]?.kind
    const right = result.chain[index + 1]?.kind
    const shape = SCHEMA[rel]
    if (!left || !right || !shape) return 'unknown'

    // Same kind on both ends (Note—LINKS_TO—Note): undecidable from shape.
    if (shape.from === shape.to) return 'unknown'

    if (left === shape.from && right === shape.to) return 'forward'
    if (left === shape.to && right === shape.from) return 'backward'
    return 'unknown'
  })
}

/**
 * Pass 2: resolve the remaining note-to-note hops against the backlink index.
 *
 * Returns a fresh array; hops it could not settle keep whatever pass 1 said.
 * Rejects only on abort — every other failure is swallowed into `unknown`,
 * because a missing arrowhead is a far better outcome than a lost path.
 */
export async function resolveDirections(
  result: PathResult,
  seed: HopDirection[],
  signal?: AbortSignal,
): Promise<HopDirection[]> {
  const resolved = [...seed]

  // One request per distinct slug, however many hops touch it.
  const cache = new Map<string, Promise<Backlink[]>>()
  const backlinksOf = (slug: string) => {
    const hit = cache.get(slug)
    if (hit) return hit
    const pending = getJson<Backlink[]>(
      `/api/notes/${encodeURIComponent(slug)}/backlinks`,
      signal,
    )
    cache.set(slug, pending)
    return pending
  }

  const pending = result.hops.map(async (rel, index) => {
    if (resolved[index] !== 'unknown') return
    if (rel !== 'LINKS_TO') return

    const left = result.chain[index]
    const right = result.chain[index + 1]
    if (!left?.slug || !right?.slug) return

    const [intoRight, intoLeft] = await Promise.all([
      backlinksOf(right.slug),
      backlinksOf(left.slug),
    ])

    const forward = intoRight.some((b) => b.slug === left.slug)
    const backward = intoLeft.some((b) => b.slug === right.slug)

    if (forward && backward) resolved[index] = 'both'
    else if (forward) resolved[index] = 'forward'
    else if (backward) resolved[index] = 'backward'
  })

  const outcomes = await Promise.allSettled(pending)
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected' && isAbort(outcome.reason)) throw outcome.reason
  }

  return resolved
}

/** One hop, in words: "Attention Is a Moral Act links to The Attention Economy". */
export function spokenHop(rel: RelType, direction: HopDirection): string {
  const phrasing = SPOKEN[rel]
  if (!phrasing) return 'is connected to'
  if (direction === 'backward') return phrasing.backward
  if (direction === 'both') return `${phrasing.forward} and back`
  if (direction === 'unknown') return `is connected to, by ${rel.toLowerCase().replace('_', ' ')},`
  return phrasing.forward
}

/** The whole chain as one sentence, for the screen-reader summary. */
export function spokenChain(result: PathResult, directions: HopDirection[]): string {
  if (result.chain.length === 0) return 'No connection.'
  if (result.chain.length === 1) return `${result.chain[0].label} — the same note on both sides.`

  const parts: string[] = [result.chain[0].label]
  result.hops.forEach((rel, index) => {
    const next = result.chain[index + 1]
    if (!next) return
    parts.push(spokenHop(rel, directions[index] ?? 'unknown'), next.label)
  })
  return `${parts.join(' ')}.`
}
