/**
 * The Explore pane — path finding and vault insights.
 *
 * `ExplorePane` is the only thing the app shell needs. The halves are exported
 * too so either can be dropped into a sidebar or a modal on its own; each one
 * owns its fetching, loading, empty and error states, so they compose without
 * a provider.
 */

export { ExplorePane, type ExplorePaneProps } from './ExplorePane'
export { PathFinder, type PathFinderProps } from './PathFinder'
export { InsightsPanel, type InsightsPanelProps } from './InsightsPanel'
export { PathChain, type PathChainProps } from './PathChain'
export { NotePicker, type NotePickerProps } from './NotePicker'
export { KIND_COLOUR, KIND_NOUN, isBridgeKind } from './palette'
