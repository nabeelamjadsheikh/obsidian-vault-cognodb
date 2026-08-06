'use client'

/**
 * One pane: its tab bar, whatever the active tab points at, and — for a note —
 * the floating status counter.
 *
 * Only the active tab is mounted. Keeping every tab alive would mean several
 * force simulations running behind panes nobody is looking at, and the graph
 * is the most expensive thing in the app.
 */

import { EmptyState } from '@/components/ui'
import { NotePane } from '@/components/note'
import { GraphPane } from '@/components/graph'
import { ExplorePane } from '@/components/explore'
import { PaneBoundary } from './PaneBoundary'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { useVault, type Pane } from './VaultProvider'

/** Shown when a pane has no tabs — the first thing a new user ever sees. */
function StartHere({ paneId }: { paneId: string }) {
  const { open, createNote, vault } = useVault()

  const suggestions: { label: string; detail: string; run: () => void }[] = [
    {
      label: 'Open the graph',
      detail: 'See every note and the links between them',
      run: () => open({ kind: 'graph' }, { paneId }),
    },
    {
      label: 'Explore the vault',
      detail: 'Busiest notes, unlinked notes, and paths between ideas',
      run: () => open({ kind: 'explore' }, { paneId }),
    },
    {
      label: 'Write a new note',
      detail: 'Start a blank note in the vault root',
      run: () => void createNote(),
    },
  ]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <h2 className="text-base font-medium text-text">Nothing open</h2>
        <p className="mt-1 text-ui text-text-muted">
          Pick a note on the left, press{' '}
          <kbd className="rounded-[3px] border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
            ⌘P
          </kbd>{' '}
          to search, or start here.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-2">
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.run}
            className="flex flex-col items-start gap-0.5 rounded-panel border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent-dim hover:bg-surface-alt"
          >
            <span className="text-ui font-medium text-text">{item.label}</span>
            <span className="text-[11.5px] text-text-faint">{item.detail}</span>
          </button>
        ))}
      </div>

      {vault.notes.length > 0 ? (
        <p className="text-[11px] text-text-faint">
          {vault.notes.length} notes · {vault.tags.length} tags · {vault.folders.length} folders
        </p>
      ) : null}
    </div>
  )
}

export function PaneView({ pane }: { pane: Pane }) {
  const { activePaneId, focusPane, open, panes, titleFor } = useVault()
  const focused = pane.id === activePaneId
  const tab = pane.tabs.find((candidate) => candidate.id === pane.activeId) ?? null

  /*
   * A graph node opens in the *other* pane when the view is split.
   *
   * That is the whole point of the arrangement in the reference screenshot:
   * the graph stays put on the right while notes come and go on the left, so
   * clicking around the constellation never costs you the map.
   */
  const openFromGraph = (slug: string) => {
    const target = panes.find((candidate) => candidate.id !== pane.id) ?? pane
    open({ kind: 'note', slug }, { paneId: target.id })
  }

  return (
    <section
      data-pane-id={pane.id}
      // Clicking anywhere in a pane focuses it, so the next sidebar click or
      // ⌘P opens where the user is already looking.
      onPointerDownCapture={() => {
        if (!focused) focusPane(pane.id)
      }}
      aria-label={focused ? 'Active pane' : 'Pane'}
      className="flex min-w-0 flex-1 flex-col bg-bg"
    >
      <TabBar pane={pane} focused={focused} />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {tab === null ? (
          <StartHere paneId={pane.id} />
        ) : (
          <PaneBoundary resetKey={`${tab.id}:${tab.slug ?? ''}`}>
            {tab.kind === 'note' && tab.slug ? (
              <NotePane slug={tab.slug} />
            ) : tab.kind === 'graph' ? (
              <GraphPane
                slug={tab.slug}
                title={tab.slug ? (titleFor(tab.slug) ?? undefined) : undefined}
                onOpenNote={openFromGraph}
              />
            ) : tab.kind === 'explore' ? (
              <ExplorePane />
            ) : (
              <EmptyState message="Nothing to show here." />
            )}
          </PaneBoundary>
        )}

        {tab?.kind === 'note' && tab.slug ? <StatusBar slug={tab.slug} /> : null}
      </div>
    </section>
  )
}

export default PaneView
