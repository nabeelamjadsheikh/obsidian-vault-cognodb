'use client'

/**
 * The reading view's markdown renderer.
 *
 * Two things make this more than a call to react-markdown:
 *
 * 1. `[[wikilinks]]`. They are not markdown, so they are rewritten into real
 *    links by `wikilinksToMarkdown()` *before* parsing — the same function the
 *    save path's sibling parser uses, so what renders and what the graph stores
 *    can never drift. Targets that do not exist yet come back tagged
 *    `?link=stub` and render as Obsidian's greyed, dotted unresolved link.
 * 2. Internal links must be `next/link`, not `<a>`, so clicking one navigates
 *    without a full page load and the note pane keeps its scroll and state.
 *
 * Everything else — headings, lists, tables, code, blockquote accent bar, task
 * checkboxes — is plain HTML styled by `.prose-note` in globals.css. No syntax
 * highlighter, no sanitiser plugin, no remote anything: react-markdown does not
 * render raw HTML by default, which is the sanitising step.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { wikilinksToMarkdown } from './wikilink'

/**
 * Stand-in for "we could not load the vault index, so assume every wikilink
 * resolves". Rendering every link as unresolved because a *list* request failed
 * would be a confident lie about the graph; rendering them as normal links is
 * the honest degradation — the click still lands somewhere real or on the
 * "doesn't exist yet" pane, which is the same answer one hop later.
 */
const ASSUME_ALL_EXIST: ReadonlySet<string> = {
  has: () => true,
} as unknown as ReadonlySet<string>

/** `/note/the-slug?link=stub` → its two interesting parts. */
function readInternalHref(href: string): { path: string; stub: boolean } | null {
  if (!href.startsWith('/note/')) return null
  const [path, query = ''] = href.split('?')
  return { path, stub: new URLSearchParams(query).get('link') === 'stub' }
}

/** Prettified target name for the unresolved-link tooltip. */
function slugToTitle(path: string): string {
  const slug = decodeURIComponent(path.replace(/^\/note\//, ''))
  const words = slug.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Anchors, in three flavours: wikilink, in-page heading anchor, and external.
 *
 * External links open in a new tab so a click never destroys unsaved editor
 * state, and carry `rel="noreferrer"` because nothing outside the vault needs
 * to know where the reader came from.
 */
function MarkdownLink({
  href,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<'a'>) {
  if (!href) return <span {...rest}>{children}</span>

  const internal = readInternalHref(href)
  if (internal) {
    return (
      <Link
        href={internal.path}
        className={internal.stub ? 'internal-link is-stub' : 'internal-link'}
        title={
          internal.stub
            ? `${slugToTitle(internal.path)} — not created yet. Click to start it.`
            : slugToTitle(internal.path)
        }
        data-stub={internal.stub ? 'true' : undefined}
      >
        {children}
      </Link>
    )
  }

  if (href.startsWith('#')) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  )
}

/**
 * Task-list checkboxes.
 *
 * remark-gfm already emits `<input type="checkbox" disabled>`; this exists to
 * add `readOnly` (so React never treats it as an uncontrolled-value bug) and an
 * accessible label, because a bare checkbox in a screen reader is just "unnamed
 * checkbox, checked". The visual treatment — accent fill, strikethrough — is in
 * globals.css. Toggling belongs to the editor, not to the reading view.
 */
function MarkdownCheckbox({ checked, type, ...rest }: React.ComponentPropsWithoutRef<'input'>) {
  if (type !== 'checkbox') return <input type={type} {...rest} />
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      readOnly
      disabled
      aria-label={checked ? 'Task, done' : 'Task, not done'}
      {...rest}
    />
  )
}

const COMPONENTS: Components = {
  a: MarkdownLink,
  input: MarkdownCheckbox,
}

export interface NoteMarkdownProps {
  /** Raw note body, wikilinks and all. */
  body: string
  /**
   * Slugs that exist in the vault. `null` means "not known yet", which renders
   * every wikilink as resolved rather than greying the whole note out.
   */
  existingSlugs: ReadonlySet<string> | null
  className?: string
}

/** Render a note body as the reading view. */
export function NoteMarkdown({ body, existingSlugs, className = '' }: NoteMarkdownProps) {
  // Rewriting and parsing a long note is not free, and the pane re-renders on
  // every keystroke of the live word count while editing.
  const source = useMemo(
    () => wikilinksToMarkdown(body, existingSlugs ?? ASSUME_ALL_EXIST),
    [body, existingSlugs],
  )

  return (
    <div className={`prose-note ${className}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {source}
      </Markdown>
    </div>
  )
}

/**
 * `[[Target|alias]]` → `alias`, for places that show a sentence of a note
 * without rendering it — backlink contexts and search snippets. Leaving the
 * brackets in makes those panels read like source code.
 */
export function stripWikilinks(text: string): string {
  return (
    text
      .replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, (_m, target: string, alias?: string) =>
        (alias ?? target).trim(),
      )
      // A context sentence is a *slice* of a body, so it can end part-way
      // through a link — `…described in [[Expertise Is Mostly…`. Left alone,
      // the stray brackets are the one bit of syntax that leaks into a panel
      // whose whole job is to read like prose.
      .replace(/\[\[([^\[\]|]*)(?:\|([^\[\]]*))?$/, (_m, target: string, alias?: string) =>
        alias ?? target,
      )
  )
}

export default NoteMarkdown
