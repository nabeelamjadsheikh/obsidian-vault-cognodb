/**
 * The query layer — every read the app performs, in one place.
 *
 * Routes and scripts import from `@/lib/queries`, never from the individual
 * modules, so the split below is free to change without touching a caller.
 * Nothing above this directory writes Cypher, and nothing in this directory
 * imports `neo4j-driver`: `runQuery`/`runWrite` in lib/db.ts are the only
 * doors to the database.
 *
 * Two rules hold across every file here:
 *
 *   - Cypher is always a static string literal with `$parameters`. No
 *     interpolation, no concatenation, no exceptions — including for values
 *     that could never come from a user.
 *   - Empty is an answer. A query with no results returns `[]` (or `null` for
 *     a single lookup, or an empty graph) and the UI renders an empty state.
 *     Only an actual database failure throws, and lib/db.ts has already turned
 *     that into a typed `DbError` by the time it gets here.
 *
 * The nine assignment queries:
 *
 *   1. getBacklinks       notes.ts     inbound links with their context sentence
 *   2. getLocalGraph      graph.ts     MULTI-HOP — neighbourhood to depth 1..3
 *   3. findPath           graph.ts     AWKWARD IN SQL — shortest path between notes
 *   4. getSuggestedLinks  notes.ts     unlinked notes sharing 2+ entities
 *   5. getOrphans         insights.ts  notes with no links in or out
 *   6. getHubs            insights.ts  most connected notes, in/out degree
 *   7. getFolderTree      notes.ts     recursive folder hierarchy with ancestry
 *   8. searchNotes        search.ts    full-text with a CONTAINS fallback
 *   9. getGlobalGraph     graph.ts     the whole vault, optionally filtered
 *
 * Supporting: getNote, listNotes, getTags, getStats, getInsights.
 *
 * The write path — createNote, saveNote, deleteNote — lives in notes.ts too. It
 * is the only code here that writes, and the only code that needs a
 * transaction; see the comments there for why saving rebuilds a note's
 * relationships instead of diffing them.
 */

export {
  createNote,
  deleteNote,
  getBacklinks,
  getFolderTree,
  getNote,
  getSuggestedLinks,
  getTags,
  listNotes,
  saveNote,
} from './notes'
export type { CreateResult } from './notes'

export { ALL_REL_TYPES, clampDepth, findPath, getGlobalGraph, getLocalGraph } from './graph'

export { resetSearchMode, searchNotes } from './search'

export { getHubs, getInsights, getOrphans, getStats } from './insights'
