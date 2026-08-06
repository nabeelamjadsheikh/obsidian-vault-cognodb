'use client'

/**
 * The left sidebar: icon row, one of three panes, and a drag handle.
 *
 * Collapsing leaves a 44px rail rather than nothing. A sidebar that vanishes
 * completely leaves a first-time user with no way back — the rail keeps the
 * same four controls in the same order, so collapsing is obviously reversible.
 */

import { useCallback, useEffect, useRef } from 'react'
import { ErrorState, Icon, type IconName } from '@/components/ui'
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  useVault,
  type SidebarPane,
} from '@/components/shell/VaultProvider'
import { FileTree } from './FileTree'
import { SearchPane } from './SearchPane'
import { TagPane } from './TagPane'

function IconButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: IconName
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex size-7 shrink-0 items-center justify-center rounded-[4px] transition-colors ${
        active
          ? 'bg-surface-alt text-accent'
          : 'text-text-faint hover:bg-surface-alt hover:text-text'
      }`}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

/** The four controls, shared by the expanded header and the collapsed rail. */
function useControls() {
  const { sidebarPane, setSidebarPane, createNote, toggleSidebar, sidebarCollapsed } = useVault()

  const choose = useCallback(
    (pane: SidebarPane) => {
      setSidebarPane(pane)
      if (sidebarCollapsed) toggleSidebar()
    },
    [setSidebarPane, sidebarCollapsed, toggleSidebar],
  )

  return { sidebarPane, choose, createNote }
}

function ControlRow({ vertical = false }: { vertical?: boolean }) {
  const { sidebarPane, choose, createNote } = useControls()
  const { toggleSidebar, sidebarCollapsed } = useVault()

  return (
    <div
      className={`flex ${vertical ? 'flex-col items-center gap-1 px-1.5 py-2' : 'items-center gap-0.5 px-2 py-2'}`}
    >
      <IconButton icon="new-note" label="New note" onClick={() => void createNote()} />
      <IconButton
        icon="folder"
        label="Files"
        active={!sidebarCollapsed && sidebarPane === 'files'}
        onClick={() => choose('files')}
      />
      <IconButton
        icon="search"
        label="Search"
        active={!sidebarCollapsed && sidebarPane === 'search'}
        onClick={() => choose('search')}
      />
      <IconButton
        icon="tag"
        label="Tags"
        active={!sidebarCollapsed && sidebarPane === 'tags'}
        onClick={() => choose('tags')}
      />
      <div className={vertical ? 'h-1' : 'ml-auto'} />
      <IconButton
        icon="sidebar-toggle"
        label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        onClick={toggleSidebar}
      />
    </div>
  )
}

export function Sidebar() {
  const { sidebarCollapsed, sidebarWidth, setSidebarWidth, sidebarPane, vault } = useVault()
  const draggingRef = useRef(false)

  /**
   * Drag to resize. Listeners live on the document for the duration of the
   * drag so the pointer can leave the 4px handle without the resize dying,
   * and `user-select` is suppressed so the tree does not highlight mid-drag.
   */
  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      draggingRef.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (move: PointerEvent) => {
        if (draggingRef.current) setSidebarWidth(move.clientX)
      }
      const onUp = () => {
        draggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [setSidebarWidth],
  )

  useEffect(
    () => () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    [],
  )

  if (sidebarCollapsed) {
    return (
      <nav
        aria-label="Vault navigation"
        className="flex h-full w-11 shrink-0 flex-col border-r border-border bg-surface"
      >
        <ControlRow vertical />
      </nav>
    )
  }

  return (
    <nav
      aria-label="Vault navigation"
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-surface"
      style={{ width: sidebarWidth }}
    >
      <div className="border-b border-border">
        <ControlRow />
      </div>

      {/* Each pane owns its own scrolling so its header can stick; the wrapper
          only clips, otherwise the sidebar would grow two scrollbars. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* A failed index is reported once, here, rather than three times over.
            The shell escalates DB_* failures to a full-pane panel; anything
            else is survivable and stays inline. */}
        {vault.error ? (
          <ErrorState
            code={vault.error.code}
            message={vault.error.message}
            size="compact"
            onRetry={vault.reload}
          />
        ) : sidebarPane === 'search' ? (
          <SearchPane />
        ) : sidebarPane === 'tags' ? (
          <TagPane />
        ) : (
          <div className="h-full overflow-y-auto">
            <FileTree />
          </div>
        )}
      </div>

      <div
        onPointerDown={startDrag}
        onDoubleClick={() => setSidebarWidth(260)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={sidebarWidth}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        title="Drag to resize · double-click to reset"
        className="absolute inset-y-0 -right-[3px] z-20 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-accent-dim/50"
      />
    </nav>
  )
}

export default Sidebar
