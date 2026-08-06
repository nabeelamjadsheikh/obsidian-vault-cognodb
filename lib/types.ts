/**
 * Shared type contracts.
 *
 * Every API route, query function and component codes against these. They are
 * the single source of truth for the shape of data crossing the network
 * boundary, so changing one here is a deliberate, visible act.
 */

/** Every label that exists in the graph. */
export type NodeKind = 'Note' | 'Folder' | 'Tag' | 'Person' | 'Source'

/** Every relationship type that exists in the graph. */
export type RelType =
  | 'LINKS_TO'
  | 'TAGGED'
  | 'IN_FOLDER'
  | 'CHILD_OF'
  | 'MENTIONS'
  | 'CITES'
  | 'AUTHORED_BY'

/* ------------------------------------------------------------------ notes */

/** A note as listed in the sidebar — no body, so lists stay cheap. */
export interface NoteSummary {
  slug: string
  title: string
  folder: string | null
  tags: string[]
  updatedAt: string
  wordCount: number
  /**
   * True when this note exists only because something links to it — Obsidian's
   * unresolved link. Rendered greyed out and faded in the graph.
   */
  stub: boolean
}

/** A note with its full markdown body, for the editor and reading pane. */
export interface Note extends NoteSummary {
  body: string
  createdAt: string
  /** People mentioned in the body. */
  people: string[]
  /** Sources cited by the body. */
  sources: string[]
}

/** What the user submits when creating or saving. Links are derived, never sent. */
export interface NoteInput {
  title: string
  body: string
  folder?: string | null
}

/* -------------------------------------------------------------- backlinks */

/**
 * An inbound link. `context` is the sentence the link appeared in, stored on
 * the LINKS_TO relationship — it is what makes the panel readable rather than
 * just a list of filenames.
 */
export interface Backlink {
  slug: string
  title: string
  context: string
}

/**
 * A note the graph thinks should be linked but is not: it shares `strength`
 * distinct tags/people/sources with the current note, listed in `via`.
 */
export interface Suggestion {
  slug: string
  title: string
  via: string[]
  strength: number
}

/* ------------------------------------------------------------------ graph */

export interface GraphNode {
  /** Stable identity: `${kind}:${slug|name}`. Unique across all labels. */
  id: string
  label: string
  kind: NodeKind
  /** Total incident edges — drives node radius in the force graph. */
  degree: number
  /** Only meaningful when kind === 'Note'. */
  stub?: boolean
  /** Slug for Note nodes, so clicking one can open it. */
  slug?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: RelType
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** Query params for the graph endpoint. */
export interface GraphQuery {
  scope: 'global' | 'local'
  /** Required when scope is 'local'. */
  slug?: string
  /** 1–3. Clamped server-side; see the literal-ceiling note in lib/queries. */
  depth?: number
  /** Which relationship types to include. Defaults to all. */
  types?: RelType[]
}

/* ------------------------------------------------------------- path finder */

export interface PathStep {
  label: string
  kind: NodeKind
  /** Present for Note steps so the chain is clickable. */
  slug?: string
}

/**
 * The connection chain between two notes. `null` when no path exists within
 * the hop limit — a real and expected answer, not an error.
 */
export interface PathResult {
  chain: PathStep[]
  hops: RelType[]
  distance: number
}

/* ------------------------------------------------------- tree, tags, search */

export interface FolderNode {
  path: string
  name: string
  /** Folder names from this node up to the root, for building the tree. */
  ancestry: string[]
  noteCount: number
}

export interface TagCount {
  name: string
  count: number
}

export interface SearchResult {
  slug: string
  title: string
  /** Body excerpt around the match. */
  snippet: string
  score: number
}

/* --------------------------------------------------------------- insights */

export interface HubNote {
  slug: string
  title: string
  inbound: number
  outbound: number
}

export interface VaultStats {
  notes: number
  links: number
  tags: number
  people: number
  sources: number
  /** Notes that exist only as unresolved links. */
  stubs: number
}

export interface Insights {
  orphans: NoteSummary[]
  hubs: HubNote[]
  stats: VaultStats
}

/* ------------------------------------------------------------------ errors */

/**
 * Error codes the UI switches on. DB_* codes drive the "can't reach the vault"
 * panel; everything else is a normal in-app error.
 */
export type ApiErrorCode =
  | 'DB_UNREACHABLE'
  | 'DB_AUTH'
  | 'DB_TIMEOUT'
  | 'CONFIG'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'INTERNAL'

export interface ApiError {
  error: {
    code: ApiErrorCode
    message: string
  }
}

/** True when the failure is the database itself rather than the request. */
export function isDatabaseError(code: ApiErrorCode): boolean {
  return (
    code === 'DB_UNREACHABLE' ||
    code === 'DB_AUTH' ||
    code === 'DB_TIMEOUT' ||
    code === 'CONFIG'
  )
}

/** Narrowing helper for `await res.json()` results. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiError).error?.code === 'string'
  )
}
