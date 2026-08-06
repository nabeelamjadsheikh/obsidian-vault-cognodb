'use client'

/**
 * The editor: one textarea.
 *
 * That is a decision, not a shortcut. A rich-text or CodeMirror editor would
 * add a large dependency, a second source of truth for the document, and a
 * whole class of paste and IME bugs — to render text that is already plain
 * markdown. A monospace textarea shows the reader exactly the characters the
 * vault will store, which is also what makes `[[` feel like a thing you type
 * rather than a widget you summon.
 *
 * It grows with its content instead of scrolling internally, so the note is one
 * continuous column in both modes and the panels below stay where they were.
 */

import { useEffect, useLayoutEffect, useRef } from 'react'

/** `useLayoutEffect` warns during SSR; the fallback never actually runs a resize. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface NoteEditorProps {
  value: string
  onChange: (value: string) => void
  /** Saves on blur — leaving the editor is a commit, like closing a file. */
  onBlur: () => void
  /** Focus on mount, so ⌘E lands the cursor in the text. */
  autoFocus?: boolean
  disabled?: boolean
}

export function NoteEditor({ value, onChange, onBlur, autoFocus = false, disabled = false }: NoteEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow to fit. Reset to `auto` first or the box can only ever get taller.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    if (!el) return
    el.focus()
    // Cursor at the end rather than selecting everything: the next keystroke
    // should continue the note, not replace it.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        spellCheck
        aria-label="Note body, markdown"
        placeholder="Start writing. Use [[double brackets]] to link another note."
        className="w-full resize-none rounded-panel border border-border bg-surface px-4 py-3.5 font-mono text-[13.5px] leading-[1.7] text-text outline-none transition-colors focus:border-accent-dim disabled:text-text-muted"
      />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-faint">
        <span>
          <span className="text-text-muted">[[double brackets]]</span> link to another note
        </span>
        <span>
          <span className="text-text-muted">#tag</span> files it
        </span>
        <span>
          <span className="text-text-muted"># heading</span>, <span className="text-text-muted">- item</span>,{' '}
          <span className="text-text-muted">- [ ] task</span>, <span className="text-text-muted">&gt; quote</span>
        </span>
      </p>
    </div>
  )
}

export default NoteEditor
