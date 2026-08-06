/**
 * The graph pane — Obsidian's constellation view.
 *
 * `GraphPane` is the only thing the app needs. Everything else is exported for
 * completeness (and for tests), not because the layout should assemble the pane
 * itself: the canvas must never be imported on the server, and GraphPane is
 * what guarantees that.
 */

export { GraphPane, type GraphPaneProps } from './GraphPane'
export { GraphControls, type GraphControlsProps, type GraphMode } from './GraphControls'
export { GraphLegend } from './GraphLegend'
export { useGraphData, type GraphRequest, type GraphDataState } from './useGraphData'
export {
  FILTERABLE_KINDS,
  KIND_COLOR,
  KIND_LABEL,
  nodeRadius,
  relTypesFor,
  type FilterKind,
} from './graphStyle'
