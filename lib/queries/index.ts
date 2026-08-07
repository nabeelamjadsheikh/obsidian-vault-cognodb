/**
 * Every database read and write the app performs. Import from `@/lib/queries`,
 * not from the modules below.
 *
 * Two rules hold throughout:
 *
 *   - Cypher is always a static literal with `$parameters`. Never interpolated,
 *     not even for values that cannot come from a user.
 *   - Empty is an answer, not an error. No results returns `[]` or `null` and
 *     the UI renders an empty state; only a real database failure throws.
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
