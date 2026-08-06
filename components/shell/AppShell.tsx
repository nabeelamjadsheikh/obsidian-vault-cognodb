'use client'

/**
 * The frame: sidebar on the left, one or two panes on the right, a quick
 * switcher over the top.
 *
 * It owns exactly three things — the split geometry, the global keyboard
 * shortcuts, and the decision to give up. Everything else is delegated, so
 * this file stays readable as the map of the app.
 */

import { Fragment, useCallback, useEffect, useRef } from 'react'
import { ErrorState } from '@/components/ui'
import { isDatabaseError } from '@/lib/types'
import { Sidebar } from '@/components/sidebar'
import { PaneView } from './PaneView'
import { QuickSwitcher } from './QuickSwitcher'
import { VaultProvider, useVault } from './VaultProvider'

/** The draggable seam between two panes. */
function PaneDivider({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const { setSplitRatio } = useVault()

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const container = containerRef.current
      if (!container) return

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (move: PointerEvent) => {
        const box = container.getBoundingClientRect()
        if (box.width === 0) return
        const ratio = (move.clientX - box.left) / box.width
        // Clamped so a pane can never be dragged down to a sliver the user
        // then cannot grab again.
        setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)))
      }
      const onUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [containerRef, setSplitRatio],
  )

  return (
    <div
      onPointerDown={startDrag}
      onDoubleClick={() => setSplitRatio(0.55)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the split"
      title="Drag to resize · double-click to even them up"
      className="w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent-dim"
    />
  )
}

/** A short-lived message — the only feedback channel the shell needs. */
function Notice() {
  const { notice } = useVault()
  if (!notice) return null

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-panel border border-border bg-surface px-4 py-2 text-ui text-text shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
    >
      {notice}
    </div>
  )
}

function Workspace() {
  const { panes, splitRatio, setQuickOpen, quickOpen, toggleSidebar, vault, open } = useVault()
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.key === 'p' || event.key === 'P') {
        event.preventDefault()
        setQuickOpen(!quickOpen)
        return
      }
      // Obsidian's own binding for the file explorer.
      if (event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [quickOpen, setQuickOpen, toggleSidebar])

  /*
   * Turn every `/note/…` link into a tab open.
   *
   * Wikilinks, backlinks and suggested links are rendered as real anchors by
   * the note pane — correct, because they should be middle-clickable and
   * copyable. But letting one navigate would remount the workspace and throw
   * away the tabs and the split. Intercepting here, on the capture phase,
   * keeps the markup honest and the workspace intact. ⌘/Ctrl-click opens a new
   * tab in the same pane — the same gesture the sidebar uses — while
   * middle-click and shift-click are left alone for the browser.
   *
   * Declared before the early return below: every hook in this component has
   * to run on every render, or the render after the database drops out would
   * change the hook count and take the whole app down with it.
   */
  const onWorkspaceClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0 || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return

      const href = anchor.getAttribute('href') ?? ''
      if (!href.startsWith('/note/')) return

      const slug = decodeURIComponent(href.slice('/note/'.length))
      if (!slug) return

      event.preventDefault()
      const paneId = anchor.closest('[data-pane-id]')?.getAttribute('data-pane-id') ?? undefined
      open({ kind: 'note', slug }, { paneId, newTab: event.metaKey || event.ctrlKey })
    },
    [open],
  )

  /*
   * The database being down is the one failure the frame cannot route around:
   * with no folders, no notes and no search there is nothing to render a
   * sidebar or a tab bar *of*. So it takes over the window, says so in plain
   * language, and offers the retry — which is all a transient container
   * restart needs.
   */
  if (vault.error && isDatabaseError(vault.error.code)) {
    return (
      <div className="flex h-full flex-col bg-bg">
        <header className="flex h-9 shrink-0 items-center border-b border-border bg-surface px-3 text-ui text-text-muted">
          Vault
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <ErrorState
            code={vault.error.code}
            message={vault.error.message}
            onRetry={vault.reload}
            retrying={vault.loading}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg" onClickCapture={onWorkspaceClick}>
      <Sidebar />

      {/* The left pane is sized by the split ratio and the right one takes the
          rest, so dragging the seam moves one number instead of two. */}
      <div ref={mainRef} className="flex min-w-0 flex-1">
        {panes.map((pane, index) => (
          <Fragment key={pane.id}>
            {index > 0 ? <PaneDivider containerRef={mainRef} /> : null}
            <div
              className="flex min-w-0"
              style={
                panes.length > 1 && index === 0
                  ? { width: `${splitRatio * 100}%` }
                  : { flex: '1 1 0%' }
              }
            >
              <PaneView pane={pane} />
            </div>
          </Fragment>
        ))}
      </div>

      <QuickSwitcher />
      <Notice />
    </div>
  )
}

export function AppShell({ initialSlug }: { initialSlug?: string }) {
  return (
    <VaultProvider initialSlug={initialSlug}>
      <Workspace />
    </VaultProvider>
  )
}

export default AppShell
