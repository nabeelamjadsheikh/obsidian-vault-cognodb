/**
 * The colours the Explore pane paints with.
 *
 * Two palettes live here, and they answer different questions.
 *
 * 1. KIND_COLOUR — identity. It is the *same* palette the graph pane uses, so a
 *    teal chip means "Person" everywhere in the app. These four hex values are
 *    not design tokens: they are graph semantics, they have no `bg-*` utility,
 *    and inventing token names for them would imply the rest of the chrome may
 *    use them. Everything else in this pane uses the Tailwind token classes.
 *
 * 2. HUB_IN / HUB_OUT — the diverging poles of the hub bar. A note's inbound and
 *    outbound degree is a polarity, not two independent series: high inbound is
 *    a destination the vault keeps returning to, high outbound is a map-of-
 *    contents. So the bar diverges from a neutral centre line, which needs two
 *    hues that stay apart under colour-vision deficiency.
 *
 *    Both were validated against the #262626 panel surface in dark mode:
 *    OKLCH lightness inside the 0.48–0.67 dark band, chroma above the grey
 *    floor, adjacent CVD ΔE 9.6 (deutan) / 12.7 (tritan), normal-vision ΔE 17.9,
 *    contrast ≥ 3:1. They are also never colour-alone — the bar carries a
 *    legend and a printed count at each end.
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
