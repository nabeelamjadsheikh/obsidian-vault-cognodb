/**
 * Colours for the Explore pane.
 *
 * KIND_COLOUR is shared with the graph pane so a teal chip means "Person"
 * everywhere. These are graph semantics rather than design tokens, which is why
 * they are raw hex and have no `bg-*` utility.
 *
 * HUB_IN / HUB_OUT are the diverging poles of the hub bar. Both were checked
 * against the panel surface for colour-vision deficiency (adjacent ΔE 9.6
 * deutan, 12.7 tritan, contrast ≥ 3:1), and neither is ever colour-alone — the
 * bar carries a legend and a printed count at each end.
 */

import type { NodeKind } from '@/lib/types'

/** Node identity, shared with the graph pane. */
export const KIND_COLOUR: Record<NodeKind, string> = {
  Note: '#dadada',
  Tag: '#a882ff',
  Person: '#7fd6c1',
  Source: '#e0b25f',
  Folder: '#9a9a9a',
}

/** Plain-language name for a node kind, for captions and screen readers. */
export const KIND_NOUN: Record<NodeKind, string> = {
  Note: 'note',
  Tag: 'tag',
  Person: 'person',
  Source: 'source',
  Folder: 'folder',
}

/**
 * Person and Source are the interesting steps in a path — a chain that routes
 * through an author is the thing a folder tree can never show you — so they get
 * the tinted, ringed treatment rather than the plain note card.
 */
export function isBridgeKind(kind: NodeKind): boolean {
  return kind === 'Person' || kind === 'Source'
}

/** Links pointing *at* a note. The vault's own accent hue, one step darker. */
export const HUB_IN = '#9268e6'

/** Links the note sends *out*. */
export const HUB_OUT = '#3d9ec4'

/** `color-mix` tint of a kind colour over the panel surface. */
export function tint(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, var(--color-surface))`
}

/** `color-mix` of a kind colour with transparency, for borders and rules. */
export function fade(colour: string, percent: number): string {
  return `color-mix(in srgb, ${colour} ${percent}%, transparent)`
}
