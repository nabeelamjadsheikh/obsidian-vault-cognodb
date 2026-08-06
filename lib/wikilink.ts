/**
 * Parsing markdown into graph structure.
 *
 * This is the bridge between what the user types and what the database stores.
 * The same functions run in the seed script and in the save path, so a note
 * loaded from disk and a note typed into the editor produce identical graphs.
 */

/** A `[[wikilink]]` found in a body, with the sentence it appeared in. */
export interface ParsedLink {
  /** The note title as written inside the brackets. */
  target: string
  /** Slug derived from the target title. */
  targetSlug: string
  /** Display text — `[[Target|alias]]` renders the alias. */
  alias: string | null
  /**
   * The sentence containing the link. Stored on the LINKS_TO relationship and
   * shown in the backlinks panel, which is the whole reason the panel is
   * readable rather than a bare list of filenames.
   */
  context: string
}

export interface ParsedBody {
  links: ParsedLink[]
  /** Inline `#tags` found in the body, deduped, without the `#`. */
  tags: string[]
  wordCount: number
}

/**
 * `[[Title]]` or `[[Title|alias]]`.
 * Titles cannot contain `[`, `]` or `|`.
 */
const WIKILINK = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g

/**
 * Inline tags: `#writing`, `#deep-work`, `#systems/thinking`.
 * Requires a non-word character before the `#` so markdown headings and URL
 * fragments are not mistaken for tags.
 */
const INLINE_TAG = /(^|[\s(])#([a-zA-Z][\w/-]*)/g

/** Fenced and inline code, which must not be scanned for links or tags. */
const CODE_BLOCK = /```[\s\S]*?```|`[^`\n]*`/g

/**
 * Title → slug. Deliberately lossy and stable: `Writing is telepathy` and
 * `writing is telepathy!` both resolve to the same note, which is what makes
 * `[[wikilinks]]` forgiving to type.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** Replace code spans with spaces so offsets into the original body stay valid. */
function maskCode(body: string): string {
  return body.replace(CODE_BLOCK, (match) => ' '.repeat(match.length))
}

/**
 * Pull the sentence containing `index` out of `body`.
 *
 * Sentence splitting is heuristic by nature; this errs toward returning a
 * little too much rather than truncating mid-thought, and falls back to a
 * character window when there is no sentence punctuation nearby (headings,
 * list items, table cells).
 */
export function extractContext(body: string, index: number, maxLength = 240): string {
  const BOUNDARY = /[.!?]\s|\n{2,}|\n[-*>#]|\n\d+\./

  // Walk back to the start of the sentence or block.
  let start = 0
  const before = body.slice(0, index)
  const boundaries = [...before.matchAll(new RegExp(BOUNDARY, 'g'))]
  if (boundaries.length > 0) {
    const last = boundaries[boundaries.length - 1]
    start = last.index! + last[0].length
  }
  // A single newline mid-paragraph is a soft wrap, but a list item start is not.
  const lineStart = before.lastIndexOf('\n')
  if (lineStart > start) start = lineStart + 1

  // Walk forward to the end of the sentence or block.
  const after = body.slice(index)
  const endMatch = after.match(BOUNDARY)
  let end = index + (endMatch ? endMatch.index! + 1 : after.length)

  // Guard against a runaway paragraph swallowing the whole note.
  if (end - start > maxLength * 2) end = Math.min(end, index + maxLength)
  if (index - start > maxLength) start = Math.max(start, index - maxLength)

  /*
   * Strip inline markdown from the context.
   *
   * This is displayed as prose in the backlinks panel, not rendered as
   * markdown, so a sentence lifted out of a bolded line arrives as
   * "Feedback is required.** This is where..." with a dangling delimiter.
   * `[[wikilinks]]` are deliberately preserved — the panel renders those as
   * real links, which is what shows the reader why the connection exists.
   */
  const context = body
    .slice(start, end)
    .replace(/^[\s>#*\-]+/, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1') // **bold**
    .replace(/(^|\s)\*\*(?=\S)|(?<=\S)\*\*(?=[\s.,;:!?)]|$)/g, '$1') // unmatched ** at a sentence edge
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2') // *italic*
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2') // _italic_
    .replace(/`([^`]*)`/g, '$1') // `code`
    .replace(/\s+/g, ' ')
    .trim()

  return context.length > maxLength ? context.slice(0, maxLength - 1).trimEnd() + '…' : context
}

/**
 * Extract every link and tag from a markdown body.
 *
 * Duplicate links to the same target collapse to one relationship, keeping the
 * first occurrence's context — a note linking to the same idea three times is
 * one edge, not three.
 */
export function parseBody(body: string): ParsedBody {
  const masked = maskCode(body)

  const byTarget = new Map<string, ParsedLink>()
  for (const match of masked.matchAll(WIKILINK)) {
    const target = match[1].trim()
    if (!target) continue

    const targetSlug = slugify(target)
    if (!targetSlug || byTarget.has(targetSlug)) continue

    byTarget.set(targetSlug, {
      target,
      targetSlug,
      alias: match[2]?.trim() ?? null,
      context: extractContext(body, match.index!),
    })
  }

  const tags = new Set<string>()
  for (const match of masked.matchAll(INLINE_TAG)) {
    tags.add(match[2].toLowerCase())
  }

  // Word count excludes link syntax and frontmatter so the status bar figure
  // matches what the reader actually sees.
  const prose = masked
    .replace(WIKILINK, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/[#*_>`\[\]()]/g, ' ')
  const wordCount = prose.split(/\s+/).filter(Boolean).length

  return { links: [...byTarget.values()], tags: [...tags], wordCount }
}

/**
 * Rewrite `[[Title]]` into markdown links the renderer can handle, marking
 * targets that do not exist yet so they render greyed out.
 */
export function wikilinksToMarkdown(body: string, existingSlugs: ReadonlySet<string>): string {
  return body.replace(WIKILINK, (_match, rawTarget: string, alias?: string) => {
    const target = rawTarget.trim()
    const slug = slugify(target)
    const text = (alias ?? target).trim()
    const kind = existingSlugs.has(slug) ? 'note' : 'stub'
    return `[${text}](/note/${slug}?link=${kind})`
  })
}

/** Strip a leading `#` and normalise, so `#Writing` and `writing` are one tag. */
export function normaliseTag(tag: string): string {
  return tag.replace(/^#/, '').trim().toLowerCase()
}
