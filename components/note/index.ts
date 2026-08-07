/**
 * The note pane. `NotePane` is the public surface — give it a slug and it
 * handles fetching, saving, and every loading/empty/error state. The rest is
 * exported for composition only.
 */

export { NotePane, type NotePaneProps } from './NotePane'
export { BacklinksPanel, type BacklinksPanelProps } from './BacklinksPanel'
export { SuggestedPanel, type SuggestedPanelProps } from './SuggestedPanel'
export { NoteHeader, type NoteHeaderProps } from './NoteHeader'
export { NoteEditor, type NoteEditorProps } from './NoteEditor'
export { Panel, type PanelProps } from './Panel'
