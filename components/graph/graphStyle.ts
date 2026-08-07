/**
 * Every visual constant the canvas needs, in one place.
 *
 * The graph is painted on a `<canvas>`, and canvas has no cascade — it cannot
 * read a Tailwind class or a CSS custom property. So the design tokens are
 * mirrored here as literals, and this file is the *only* place in the pane
 * where a colour is written out. Everything drawn on the canvas imports from
 * here; everything drawn in HTML uses the utility classes.
 *
 * The mirrored values must stay in step with `@theme` in app/globals.css:
 *   bg #1e1e1e · text #dadada · text-muted #999 · text-faint #6a6a6a
 *   border #363636 · accent #a882ff
 */

import type { NodeKind, RelType } from '@/lib/types'

/* ------------------------------------------------------------------ colour */

/** Node fill per label. The four non-Note hues are what makes the picture readable at a glance. */
export const KIND_COLOR: Record<NodeKind, string> = {
  Note: '#dadada',
  Tag: '#a882ff',
  Person: '#7fd6c1',
  Source: '#e0b25f',
  Folder: '#6a6a6a',
}

/** Plain-language plural for each label — used by the legend and the filters. */
export const KIND_LABEL: Record<NodeKind, string> = {
  Note: 'Notes',
  Tag: 'Tags',
  Person: 'People',
  Source: 'Sources',
  Folder: 'Folders',
}

/** One line explaining what each kind of dot actually is, for the legend. */
/** Canvas background. Matches `--color-bg` so the pane has no visible seam. */
export const CANVAS_BG = '#1e1e1e'

export const ACCENT = '#a882ff'
export const TEXT = '#dadada'
export const TEXT_MUTED = '#999999'

/**
 * Link colours, tinted toward the kind of thing they connect to. A tag edge
 * reading faintly purple and a citation faintly amber lets you follow a strand
 * without hovering it, which is most of what makes a hairball navigable.
 */
export const LINK_COLOR: Record<RelType, string> = {
  LINKS_TO: 'rgba(218, 218, 218, 0.13)',
  TAGGED: 'rgba(168, 130, 255, 0.11)',
  MENTIONS: 'rgba(127, 214, 193, 0.13)',
  CITES: 'rgba(224, 178, 95, 0.13)',
  AUTHORED_BY: 'rgba(224, 178, 95, 0.10)',
  IN_FOLDER: 'rgba(106, 106, 106, 0.10)',
  CHILD_OF: 'rgba(106, 106, 106, 0.10)',
}

/** A link with neither end near the cursor. Present, but out of the way. */
export const LINK_DIMMED = 'rgba(218, 218, 218, 0.028)'
/** A link touching the hovered node. */
export const LINK_HIGHLIGHT = 'rgba(168, 130, 255, 0.62)'

/* ------------------------------------------------------------------ filters */

/**
 * The node kinds the user can switch off. `Note` is absent on purpose: a graph
 * of no notes is not a view anyone wants, and the API always returns them.
 */
export const FILTERABLE_KINDS = ['Tag', 'Person', 'Source', 'Folder'] as const
export type FilterKind = (typeof FILTERABLE_KINDS)[number]

/**
 * Turn "which kinds of dot do you want to see" into the `types` the API speaks.
 *
 * The endpoint filters by *relationship* type, not by label — but because the
 * global query only keeps a Tag/Person/Source/Folder when it still has an edge
 * of a selected type, dropping a relationship type drops its nodes too. So the
 * mapping below is exact rather than approximate.
 *
 * LINKS_TO is always included: note-to-note links are the graph.
 *
 * AUTHORED_BY (Source → Person) needs *both* ends switched on. Sending it while
 * People are hidden would drag every author back into the picture through the
 * back door, because a Person with an AUTHORED_BY edge passes the node filter.
 */
export function relTypesFor(enabled: ReadonlySet<FilterKind>): RelType[] {
  const types: RelType[] = ['LINKS_TO']
  if (enabled.has('Tag')) types.push('TAGGED')
  if (enabled.has('Person')) types.push('MENTIONS')
  if (enabled.has('Source')) types.push('CITES')
  if (enabled.has('Folder')) types.push('IN_FOLDER', 'CHILD_OF')
  if (enabled.has('Person') && enabled.has('Source')) types.push('AUTHORED_BY')
  return types
}

/* ------------------------------------------------------------------- sizing */

/**
 * Radius from degree.
 *
 * Square root, not linear: degree runs from 0 to ~36 in this vault, and a
 * linear map would make the hubs eighteen times the width of a leaf and swamp
 * everything else. sqrt keeps hubs obviously bigger — which is the whole point,
 * it is what turns a hairball into a picture with landmarks — while leaving the
 * long tail legible. Radius is in graph units; the canvas scales it on zoom.
 */
export function nodeRadius(degree: number): number {
  return 2.2 + 1.55 * Math.sqrt(Math.max(0, degree))
}

/** The open note is drawn larger than its degree alone would justify. */
export const FOCUS_RADIUS_BONUS = 1.8

/* ------------------------------------------------------------------- labels */

/**
 * Zoom past this and every node is named. Below it only hubs are, so the
 * default view shows a dozen landmarks instead of 273 overlapping words.
 */
export const LABEL_ZOOM = 1.9

/** Below this, even hub labels are hidden — the view is too small to read. */
export const HUB_LABEL_ZOOM = 0.55

/** How many of the highest-degree nodes keep their label at low zoom. */
export const HUB_LABEL_COUNT = 14

/** Label size in CSS pixels; divided by the zoom so it stays constant on screen. */
export const LABEL_PX = 11
