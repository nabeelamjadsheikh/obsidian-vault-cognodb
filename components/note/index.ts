/**
 * The note pane — reading, editing, backlinks and suggested links.
 *
 * `NotePane` is the whole public surface: give it a slug and it handles
 * fetching, every loading/empty/error state, saving and the live refresh of the
 * connection panels. The pieces below are exported for composition, not because
 * anything outside this directory is expected to need them.
 */

export { NotePane, type NotePaneProps } from './NotePane'
export { BacklinksPanel, type BacklinksPanelProps } from './BacklinksPanel'
export { SuggestedPanel, type SuggestedPanelProps } from './SuggestedPanel'
export { NoteHeader, type NoteHeaderProps } from './NoteHeader'
export { NoteEditor, type NoteEditorProps } from './NoteEditor'
export { Panel, type PanelProps } from './Panel'
