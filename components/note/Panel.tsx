'use client'

/**
 * The collapsible container the backlinks and suggestion panels share.
 *
 * Obsidian puts these below the note, folded into a header you can click. The
 * header is a real `<button>` with `aria-expanded` rather than a styled div, so
 * the panel is reachable and announced correctly by keyboard and screen reader
 * — which is most of what "a non-technical person can use this" means once the
 * mouse is not involved.
 */

import { useId, useState } from 'react'

import { Icon } from '@/components/ui'

export interface PanelProps {
  /** e.g. "3 backlinks" — already pluralised by the caller. */
  title: string
  /** Muted one-liner explaining what the panel is, for readers who have never seen a vault. */
  subtitle?: string
  /** Shown greyed while the panel's data is still loading. */
  loading?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}

export function Panel({ title, subtitle, loading = false, defaultOpen = true, children }: PanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section className="border-t border-border">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex w-full items-center gap-2 py-3 text-left transition-colors hover:text-text"
        >
          <Icon
            name="chevron-right"
            size={14}
            className={`shrink-0 text-text-faint transition-transform duration-150 ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className={`text-ui font-medium ${loading ? 'text-text-faint' : 'text-text'}`}>
            {title}
          </span>
          {subtitle ? (
            <span className="truncate text-[11px] text-text-faint">{subtitle}</span>
          ) : null}
        </button>
      </h2>

      {/* Kept mounted but hidden so collapsing never re-fetches or loses scroll. */}
      <div id={bodyId} hidden={!open} className="pb-4">
        {children}
      </div>
    </section>
  )
}

export default Panel
