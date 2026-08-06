'use client'

/**
 * The Explore pane: the two things this app can do that a folder of markdown
 * files cannot.
 *
 * Path finding comes first because it is the question people actually have —
 * "wait, how did I get from that to this?" — and vault insights second,
 * because it is the question you ask when you are tidying rather than
 * thinking. Each half loads, fails and empties independently: if the insights
 * query falls over, the path finder above it keeps working.
 */

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { InsightsPanel } from './InsightsPanel'
import { PathFinder } from './PathFinder'

export interface ExplorePaneProps {
  /**
   * Open a note in the workspace. Optional: when the shell does not pass one,
   * the pane falls back to the `/note/[slug]` deep link, so a path step or an
   * orphan is always clickable rather than silently inert.
   */
  onOpenNote?: (slug: string) => void
  className?: string
}

function SectionHeading({
  id,
  eyebrow,
  title,
  blurb,
}: {
  id: string
  eyebrow: string
  title: string
  blurb: string
}) {
  return (
    <header className="mb-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-accent-dim">
        {eyebrow}
      </p>
      <h2 id={id} className="mt-1 text-lg font-medium tracking-[-0.01em] text-text">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-ui text-text-muted">{blurb}</p>
    </header>
  )
}

export function ExplorePane({ onOpenNote, className = '' }: ExplorePaneProps) {
  const router = useRouter()

  const openNote = useCallback(
    (slug: string) => {
      if (onOpenNote) onOpenNote(slug)
      else router.push(`/note/${encodeURIComponent(slug)}`)
    },
    [onOpenNote, router],
  )

  return (
    <div className={`h-full overflow-y-auto bg-bg ${className}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6 sm:px-6 sm:py-8">
        <section aria-labelledby="explore-path">
          <SectionHeading
            id="explore-path"
            eyebrow="Path finder"
            title="How are these two notes connected?"
            blurb="Pick any two notes. The vault walks every link, citation, mention and author between them and shows you the shortest route it can find."
          />
          <PathFinder onOpenNote={openNote} />
        </section>

        <hr className="border-border" />

        <section aria-labelledby="explore-insights">
          <SectionHeading
            id="explore-insights"
            eyebrow="Vault insights"
            title="What shape is your vault in?"
            blurb="How much is in here, what has drifted loose, and which notes everything else hangs off."
          />
          <InsightsPanel onOpenNote={openNote} />
        </section>
      </div>
    </div>
  )
}

export default ExplorePane
