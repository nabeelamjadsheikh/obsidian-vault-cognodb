/**
 * The app frame: the workspace, its panes, and the client-side store the rest
 * of the UI navigates through.
 *
 * Panes built elsewhere (`components/note`, `components/graph`,
 * `components/explore`) only need `useVault` — calling `open({ kind: 'note',
 * slug })` from a backlink, a graph node or a suggestion is what makes every
 * part of the app able to hand off to every other part.
 */

export { AppShell } from './AppShell'
export { PaneView } from './PaneView'
export { PaneBoundary } from './PaneBoundary'
export { TabBar } from './TabBar'
export { StatusBar } from './StatusBar'
export { QuickSwitcher } from './QuickSwitcher'

export {
  VaultProvider,
  useVault,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  type VaultStore,
  type VaultIndex,
  type Pane,
  type Tab,
  type TabKind,
  type OpenTarget,
  type OpenOptions,
  type SidebarPane,
} from './VaultProvider'

export {
  apiFetch,
  useApi,
  useDebounced,
  toFailure,
  RequestError,
  type ApiState,
  type Failure,
} from './useApi'
