'use client'

/**
 * The settings panel that floats over the canvas — Obsidian's graph controls.
 *
 * The brief is that a non-technical person can use this, so every control is
 * named for what it does to the picture rather than for the data model: "How
 * far to explore" instead of "depth", "Show on the map" instead of "node type
 * filters", and each depth step spells out what it will include.
 *
 * It collapses to its title bar. On a narrow pane the graph is the point, and a
 * settings panel that cannot get out of the way is a settings panel in the way.
 */

import { Icon } from '@/components/ui'
import { FILTERABLE_KINDS, KIND_COLOR, KIND_LABEL, type FilterKind } from './graphStyle'

export type GraphMode = 'local' | 'global'

/** What each depth actually shows, in plain words, under the slider. */
const DEPTH_HINT: Record<number, string> = {
  1: 'Only what this note links to directly.',
  2: 'Its neighbours, and their neighbours.',
  3: 'Three steps out — the widest view.',
}

const DEPTH_TICK: Record<number, string> = { 1: '1 step', 2: '2 steps', 3: '3 steps' }

export interface GraphControlsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: GraphMode
  onModeChange: (mode: GraphMode) => void
  /** False when no note is open, which disables the "This note" mode. */
  canFocusNote: boolean
  /** Title of the open note, named in the mode hint. */
  focusTitle?: string
  depth: number
  onDepthChange: (depth: number) => void
  enabled: ReadonlySet<FilterKind>
  onToggleKind: (kind: FilterKind) => void
  onShowEverything: () => void
}

export function GraphControls({
  open,
  onOpenChange,
  mode,
  onModeChange,
  canFocusNote,
  focusTitle,
  depth,
  onDepthChange,
  enabled,
  onToggleKind,
  onShowEverything,
}: GraphControlsProps) {
  const allOn = enabled.size === FILTERABLE_KINDS.length

  return (
    <div className="w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-panel border border-border bg-surface/95 shadow-lg shadow-black/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-ui font-medium text-text-muted transition-colors hover:text-text"
      >
        <Icon
          name="chevron-right"
          size={13}
          className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <span>Graph settings</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-3 pb-3.5 pt-3">
          {/* ---- what the graph is of ---- */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Show
            </span>

            <div
              role="radiogroup"
              aria-label="What to show in the graph"
              className="flex gap-0.5 rounded-[5px] border border-border bg-bg p-0.5"
            >
              <ModeButton
                selected={mode === 'local'}
                disabled={!canFocusNote}
                onClick={() => onModeChange('local')}
                title={
                  canFocusNote
                    ? 'Only the notes near the one you have open'
                    : 'Open a note first to see its neighbourhood'
                }
              >
                This note
              </ModeButton>
              <ModeButton
                selected={mode === 'global'}
                onClick={() => onModeChange('global')}
                title="Every note in the vault at once"
              >
                Whole vault
              </ModeButton>
            </div>

            <p className="text-[11px] leading-snug text-text-faint">
              {mode === 'local'
                ? focusTitle
                  ? `Everything connected to “${focusTitle}”.`
                  : 'Everything connected to the note you have open.'
                : 'Every note, tag, person and source in the vault.'}
            </p>
          </div>

          {/* ---- how far out (local only) ---- */}
          {mode === 'local' ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="graph-depth"
                className="text-[11px] font-medium uppercase tracking-wide text-text-faint"
              >
                How far to explore
              </label>
              <input
                id="graph-depth"
                type="range"
                min={1}
                max={3}
                step={1}
                value={depth}
                onChange={(event) => onDepthChange(Number(event.target.value))}
                aria-valuetext={DEPTH_TICK[depth]}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[10px] text-text-faint">
                <span>1 step</span>
                <span>2</span>
                <span>3</span>
              </div>
              <p className="text-[11px] leading-snug text-text-muted">{DEPTH_HINT[depth]}</p>
            </div>
          ) : null}

          {/* ---- which kinds of dot ---- */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-faint">
              Include
            </legend>

            {FILTERABLE_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex cursor-pointer items-center gap-2 text-ui text-text-muted transition-colors hover:text-text"
              >
                <input
                  type="checkbox"
                  checked={enabled.has(kind)}
                  onChange={() => onToggleKind(kind)}
                  className="size-3.5 accent-accent"
                />
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: KIND_COLOR[kind] }}
                />
                <span>{KIND_LABEL[kind]}</span>
              </label>
            ))}

            <button
              type="button"
              onClick={onShowEverything}
              disabled={allOn}
              className="mt-1 self-start text-[11px] text-accent transition-colors hover:text-text disabled:cursor-default disabled:text-text-faint"
            >
              {allOn ? 'Showing everything' : 'Show everything'}
            </button>
          </fieldset>
        </div>
      ) : null}
    </div>
  )
}

function ModeButton({
  selected,
  disabled = false,
  onClick,
  title,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`flex-1 rounded-[3px] px-2 py-1 text-ui transition-colors ${
        selected
          ? 'bg-accent/20 text-accent'
          : 'text-text-muted hover:bg-surface-alt hover:text-text'
      } disabled:cursor-not-allowed disabled:text-text-faint disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  )
}

export default GraphControls
