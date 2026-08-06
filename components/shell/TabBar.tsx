'use client'

/**
 * One tab bar per pane.
 *
 * Tabs carry the pane's history, so the bar is also the pane's identity: the
 * focused pane's bar is lit, the other is dimmed. Without that cue a split
 * view leaves the user guessing where their next click will land.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui'
import { useVault, type Pane, type Tab } from './VaultProvider'

function CloseGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TabButton({
  tab,
  pane,
  active,
  paneFocused,
}: {
  tab: Tab
  pane: Pane
  active: boolean
  paneFocused: boolean
}) {
  const { selectTab, closeTab, titleFor } = useVault()

  // The vault index is the source of truth for titles, so a tab opened from a
  // graph node label or a bare slug corrects itself once the index arrives.
  const label = tab.kind === 'note' && tab.slug ? (titleFor(tab.slug) ?? tab.title) : tab.title

  return (
    <div
      className={`group relative flex min-w-0 shrink-0 items-center border-r border-border ${
        active ? 'bg-bg' : 'bg-surface hover:bg-surface-alt'
      }`}
    >
      {/* A 2px accent cap marks the active tab of the focused pane only. */}
      {active ? (
        <span
          className={`absolute inset-x-0 top-0 h-[2px] ${paneFocused ? 'bg-accent' : 'bg-border'}`}
          aria-hidden
        />
      ) : null}

      <button
        type="button"
        onClick={() => selectTab(pane.id, tab.id)}
        onAuxClick={(event) => {
          if (event.button === 1) closeTab(pane.id, tab.id)
        }}
        title={label}
        className={`flex min-w-0 max-w-[190px] items-center gap-1.5 py-2 pl-3 pr-1.5 text-ui transition-colors ${
          active ? 'text-text' : 'text-text-muted group-hover:text-text'
        }`}
      >
        {tab.kind === 'graph' ? (
          <Icon name="graph" size={13} className="shrink-0 text-text-faint" />
        ) : tab.kind === 'explore' ? (
          <Icon name="search" size={13} className="shrink-0 text-text-faint" />
        ) : null}
        <span className="truncate">{label}</span>
      </button>

      <button
        type="button"
        onClick={() => closeTab(pane.id, tab.id)}
        aria-label={`Close ${label}`}
        title="Close tab"
        className={`mr-1.5 flex size-4 shrink-0 items-center justify-center rounded-[3px] text-text-faint transition-colors hover:bg-border hover:text-text ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <CloseGlyph />
      </button>
    </div>
  )
}

/** The "+" menu. A dropdown, not three icons: it names each thing in words. */
function NewTabMenu({ paneId }: { paneId: string }) {
  const { open, createNote } = useVault()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const items: { label: string; hint: string; run: () => void }[] = [
    {
      label: 'New note',
      hint: 'Start writing something',
      run: () => void createNote(),
    },
    {
      label: 'Graph view',
      hint: 'See how notes connect',
      run: () => open({ kind: 'graph' }, { paneId, newTab: true }),
    },
    {
      label: 'Explore',
      hint: 'Hubs, orphans and paths',
      run: () => open({ kind: 'explore' }, { paneId, newTab: true }),
    },
  ]

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="New tab"
        title="New tab"
        className="flex size-7 items-center justify-center rounded-[4px] text-text-faint transition-colors hover:bg-surface-alt hover:text-text"
      >
        <PlusGlyph />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-8 z-40 w-56 overflow-hidden rounded-panel border border-border bg-surface py-1 shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false)
                item.run()
              }}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-alt"
            >
              <span className="text-ui text-text">{item.label}</span>
              <span className="text-[11px] text-text-faint">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function TabBar({ pane, focused }: { pane: Pane; focused: boolean }) {
  const { panes, splitPane, closePane } = useVault()
  const split = panes.length > 1

  return (
    <div
      className={`flex h-9 shrink-0 items-stretch border-b border-border bg-surface ${
        focused ? '' : 'opacity-70'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {pane.tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            pane={pane}
            active={tab.id === pane.activeId}
            paneFocused={focused}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1">
        <NewTabMenu paneId={pane.id} />

        {split ? (
          <button
            type="button"
            onClick={() => closePane(pane.id)}
            aria-label="Close this pane"
            title="Close this pane"
            className="flex size-7 items-center justify-center rounded-[4px] text-text-faint transition-colors hover:bg-surface-alt hover:text-text"
          >
            <CloseGlyph size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={splitPane}
            aria-label="Split the view"
            title="Split the view — opens the graph beside this note"
            className="flex size-7 items-center justify-center rounded-[4px] text-text-faint transition-colors hover:bg-surface-alt hover:text-text"
          >
            <Icon name="sidebar-toggle" size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

export default TabBar
