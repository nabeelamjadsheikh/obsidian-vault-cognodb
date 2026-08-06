'use client'

/**
 * How to read the picture.
 *
 * The colour key already lives on the filter checkboxes, so this covers the two
 * conventions nothing else explains: size means importance, and a hollow ring
 * means a note that is linked to but not written yet. Without this line the
 * graph is pretty; with it, it is information.
 */

import { KIND_COLOR } from './graphStyle'

export function GraphLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-panel border border-border bg-surface/90 px-2.5 py-1.5 text-[11px] text-text-faint shadow-lg shadow-black/30 backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        {/* Two note dots at different sizes: the size rule, shown rather than told. */}
        <span aria-hidden className="flex items-end gap-1">
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: KIND_COLOR.Note }}
          />
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: KIND_COLOR.Note }}
          />
        </span>
        <span>Bigger = more links</span>
      </span>

      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-full border opacity-60"
          style={{ borderColor: KIND_COLOR.Note }}
        />
        <span>Not written yet</span>
      </span>

      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 rounded-full ring-2 ring-accent"
          style={{ backgroundColor: KIND_COLOR.Note }}
        />
        <span>Open note</span>
      </span>
    </div>
  )
}

export default GraphLegend
