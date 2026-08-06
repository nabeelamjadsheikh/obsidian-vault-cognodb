/**
 * Note-shaped reads: a single note, the sidebar list, its inbound links, the
 * links it *should* have, and the folder hierarchy it lives in.
 *
 * Every query here is parameterised — there is no interpolation or
 * concatenation into Cypher anywhere in this directory, so query text is
 * always a static literal and only `$params` vary. That is also why the note
 * projection is written out twice below rather than shared as a fragment:
 * a shared fragment would have to be interpolated in.
 *
 * Every function returns `[]` (or `null` for a single lookup) rather than
 * throwing when the answer is legitimately empty. An empty backlinks panel is
 * a valid state the UI renders; it is not an error.
 *
 * A note on idiom: relationship-shaped facts (tags, people, sources) are
 * gathered with pattern comprehensions — `[(n)-[:TAGGED]->(t) | t.name]` —
 * rather than OPTIONAL MATCH + collect. It keeps one row per note (no
 * cartesian blow-up when a note has both tags and people) and it works
 * identically on Neo4j 4.x and 5.x, which matters because CognoDB does not
 * document which Cypher version it implements.
 */

import matter from 'gray-matter'

import { runQuery, runTransaction } from '../db'
import { normaliseTag, parseBody, slugify } from '../wikilink'
import type { ParsedLink } from '../wikilink'
import type { Backlink, FolderNode, Note, NoteInput, NoteSummary, Suggestion, TagCount } from '../types'

/* --------------------------------------------------------------- helpers */

/** Row shape shared by the two note-listing queries. */
interface NoteSummaryRow {
  slug: string
  title: string | null
  folder: string | null
  tags: (string | null)[] | null
  updatedAt: string | null
  wordCount: number | null
  stub: boolean | null
}

/**
 * Properties can legitimately be missing on a stub note (one that exists only
 * because something links to it), so every field is defaulted here rather than
 * letting `undefined` leak into the UI.
 */
function toSummary(row: NoteSummaryRow): NoteSummary {
  return {
    slug: row.slug,
    title: row.title ?? row.slug,
    folder: row.folder ?? null,
    tags: (row.tags ?? []).filter((t): t is string => typeof t === 'string').sort(),
    updatedAt: row.updatedAt ?? '',
    wordCount: row.wordCount ?? 0,
    stub: row.stub === true,
  }
}

/* ------------------------------------------------------------------ reads */

/**
 * One note with its full body, plus the entities it points at.
 *
 * Why a graph fits: the note's tags, people and sources are three different
 * relationship types fanning out from the same node, so they come back in a
 * single hop-out with no joins and no `GROUP BY`. In SQL this is three join
 * tables and three aggregate subqueries to avoid row multiplication.
 *
 * Returns `null` when the slug does not exist — the route turns that into a
 * 404; it is not a database error.
 */
export async function getNote(slug: string): Promise<Note | null> {
  const rows = await runQuery<
    NoteSummaryRow & {
      body: string | null
      createdAt: string | null
      people: (string | null)[] | null
      sources: (string | null)[] | null
    }
  >(
    `MATCH (n:Note {slug: $slug})
     RETURN
       n.slug                                        AS slug,
       n.title                                       AS title,
       head([(n)-[:IN_FOLDER]->(f:Folder) | f.path]) AS folder,
       [(n)-[:TAGGED]->(t:Tag) | t.name]             AS tags,
       n.updatedAt                                   AS updatedAt,
       n.wordCount                                   AS wordCount,
       n.stub                                        AS stub,
       n.body                                        AS body,
       n.createdAt                                   AS createdAt,
       [(n)-[:MENTIONS]->(p:Person) | p.name]        AS people,
       [(n)-[:CITES]->(s:Source)    | s.title]       AS sources
     LIMIT 1`,
    { slug },
  )

  const row = rows[0]
  if (!row) return null

  return {
    ...toSummary(row),
    body: row.body ?? '',
    createdAt: row.createdAt ?? row.updatedAt ?? '',
    people: (row.people ?? []).filter((p): p is string => typeof p === 'string').sort(),
    sources: (row.sources ?? []).filter((s): s is string => typeof s === 'string').sort(),
  }
}

/**
 * Every note in the vault, newest first, without bodies.
 *
 * Why a graph fits: the sidebar wants each note's folder and tag list inline.
 * Pattern comprehension attaches both in the same pass over the node, so the
 * list costs one query regardless of how many tags any note carries.
 */
export async function listNotes(): Promise<NoteSummary[]> {
  const rows = await runQuery<NoteSummaryRow>(
    `MATCH (n:Note)
     RETURN
       n.slug                                        AS slug,
       n.title                                       AS title,
       head([(n)-[:IN_FOLDER]->(f:Folder) | f.path]) AS folder,
       [(n)-[:TAGGED]->(t:Tag) | t.name]             AS tags,
       n.updatedAt                                   AS updatedAt,
       n.wordCount                                   AS wordCount,
       n.stub                                        AS stub
     ORDER BY coalesce(n.updatedAt, '') DESC, n.title`,
    {},
  )
  return rows.map(toSummary)
}

/**
 * 1. Inbound links — every note that points at this one, with the sentence the
 *    link appeared in.
 *
 * Why a graph fits: this is the reverse of a stored edge, and traversing an
 * edge backwards costs exactly what traversing it forwards does — no second
 * index, no denormalised "linked_from" table to keep in sync. The `context`
 * property lives *on the relationship*, which is the thing a relational schema
 * has no natural home for: it is not a fact about either note, it is a fact
 * about the link between them. That is what makes this panel readable prose
 * instead of a list of filenames.
 */
export async function getBacklinks(slug: string): Promise<Backlink[]> {
  const rows = await runQuery<{
    slug: string
    title: string | null
    context: string | null
  }>(
    `MATCH (src:Note)-[r:LINKS_TO]->(:Note {slug: $slug})
     RETURN src.slug   AS slug,
            src.title  AS title,
            r.context  AS context
     ORDER BY src.title`,
    { slug },
  )

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title ?? row.slug,
    context: row.context ?? '',
  }))
}

/**
 * 4. Notes that *should* probably be linked: they share at least two
 *    tags/people/sources with this note, yet no LINKS_TO exists in either
 *    direction.
 *
 * Why a graph fits: "reachable in two hops via any of three relationship
 * types, but not reachable in one hop via a fourth" is a single pattern here.
 * The SQL equivalent is a three-way UNION of self-joins through three junction
 * tables, grouped and counted, with a NOT EXISTS against a links table checked
 * in both directions.
 *
 * The already-linked test is deliberately undirected: a note you already link
 * *from* is not a suggestion either.
 *
 * PORTABILITY — this is why the exclusion is a list membership test rather than
 * the obvious `WHERE NOT (n)-[:LINKS_TO]-(other)`.
 *
 * CognoDB evaluates a pattern predicate incorrectly when *both* endpoints are
 * bound variables: the positive form is always true and the negated form always
 * false, regardless of whether the relationship exists. Verified against ground
 * truth — two notes with no edge between them satisfy `(a)-[:LINKS_TO]-(b)` and
 * fail `NOT (a)-[:LINKS_TO]-(b)`. `NOT EXISTS { ... }` is wrong the same way.
 * It does not raise an error; it silently returns the wrong answer, which here
 * meant every suggestion was filtered away and the panel was simply empty.
 *
 * Collecting this note's linked neighbours first and filtering with `NOT IN`
 * uses only ordinary MATCH traversal, which CognoDB gets right, and behaves
 * identically on Neo4j. Pattern predicates with an anonymous or label-only
 * endpoint — `NOT (n)-[:LINKS_TO]-()` — are unaffected and still used elsewhere.
 */
export async function getSuggestedLinks(slug: string): Promise<Suggestion[]> {
  const rows = await runQuery<{
    slug: string
    title: string | null
    via: (string | null)[] | null
    strength: number
  }>(
    `MATCH (n:Note {slug: $slug})
     OPTIONAL MATCH (n)-[:LINKS_TO]-(neighbour:Note)
     WITH n, collect(DISTINCT neighbour.slug) AS linked
     MATCH (n)-[:TAGGED|MENTIONS|CITES]->(shared)<-[:TAGGED|MENTIONS|CITES]-(other:Note)
     WHERE other.slug <> n.slug
       AND NOT other.slug IN linked
     WITH other, collect(DISTINCT coalesce(shared.name, shared.title)) AS via
     WITH other, via, size(via) AS strength
     WHERE strength >= 2
     RETURN other.slug  AS slug,
            other.title AS title,
            via,
            strength
     ORDER BY strength DESC, other.title
     LIMIT 10`,
    { slug },
  )

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title ?? row.slug,
    via: (row.via ?? []).filter((v): v is string => typeof v === 'string').sort(),
    strength: row.strength ?? 0,
  }))
}

/**
 * 7. The folder hierarchy, each folder carrying its ancestry chain and how
 *    many notes sit directly in it.
 *
 * Why a graph fits: folders nest arbitrarily deep, and `(f)-[:CHILD_OF*]->()`
 * walks the whole chain whatever its depth. SQL needs a recursive CTE for the
 * same answer, and the adjacency-list version most schemas actually ship with
 * can only do a fixed number of self-joins.
 *
 * The traversal keeps the *longest* chain per folder — that is the one ending
 * at a root — and returns its node names in order, so `ancestry` reads from
 * this folder upward. A root folder gets `[itsOwnName]`.
 *
 * `noteCount` is direct membership, not cumulative: the tree UI sums children
 * itself, and double-counting nested notes would make the numbers lie.
 */
export async function getFolderTree(): Promise<FolderNode[]> {
  const rows = await runQuery<{
    path: string
    name: string | null
    ancestry: (string | null)[] | null
    noteCount: number
  }>(
    `MATCH (f:Folder)
     OPTIONAL MATCH trail = (f)-[:CHILD_OF*1..10]->(ancestor:Folder)
     WHERE NOT (ancestor)-[:CHILD_OF]->(:Folder)
     WITH f, trail
     ORDER BY length(trail) DESC
     WITH f, head(collect(trail)) AS longest
     RETURN f.path AS path,
            f.name AS name,
            CASE WHEN longest IS NULL
                 THEN [f.name]
                 ELSE [node IN nodes(longest) | node.name]
            END AS ancestry,
            size([(:Note)-[:IN_FOLDER]->(f) | 1]) AS noteCount
     ORDER BY f.path`,
    {},
  )

  return rows.map((row) => ({
    path: row.path,
    name: row.name ?? row.path,
    ancestry: (row.ancestry ?? []).filter((a): a is string => typeof a === 'string'),
    noteCount: row.noteCount ?? 0,
  }))
}

/**
 * Every tag with how many notes carry it — the tag cloud in the sidebar.
 *
 * Why a graph fits: a tag is a node, not a string column, so its usage count
 * is the degree of that node. `size([...])` reads it straight off the
 * relationship store with no join and no `GROUP BY`.
 *
 * `count {}` would express the same thing on Neo4j 5, but CognoDB does not
 * publish its Cypher version and pattern comprehension is valid on both 4.x
 * and 5.x — so pattern comprehension is used throughout this layer.
 */
export async function getTags(): Promise<TagCount[]> {
  const rows = await runQuery<{ name: string; noteCount: number }>(
    `MATCH (t:Tag)
     WITH t, size([(t)<-[:TAGGED]-(:Note) | 1]) AS noteCount
     RETURN t.name AS name, noteCount
     ORDER BY noteCount DESC, t.name`,
    {},
  )

  return rows.map((row) => ({ name: row.name, count: row.noteCount ?? 0 }))
}

/* ----------------------------------------------------------------- writes */

/*
 * Everything below is the save path. It is the only place in the app that
 * changes the graph, and it is deliberately the only place that needs a
 * transaction: writing a note rewrites its whole outgoing neighbourhood, and a
 * half-applied rewrite is a vault that lies about itself.
 *
 * These functions signal "the request was wrong" by *returning* — `null` for a
 * missing note, `{ ok: false }` for a slug collision — rather than throwing an
 * HTTP-shaped error. Routes turn those into 404/409. That keeps this layer
 * free of `next/server`, so the same functions run under `tsx` in scripts.
 */

/** What a body says about the graph, after frontmatter and markdown parsing. */
interface ParsedNote {
  /** The body with any YAML frontmatter stripped — what gets stored. */
  body: string
  links: ParsedLink[]
  /** `null` means the body said nothing at all about this; see below. */
  tags: string[] | null
  people: string[] | null
  sources: string[] | null
  wordCount: number
}

/** Normalise a frontmatter value that may be a list, a comma string, or absent. */
function toList(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : value == null
        ? []
        : [value]
  return items.map((v) => String(v).trim()).filter(Boolean)
}

/**
 * Read a note body the same way the seed script reads a file from disk.
 *
 * Tags come from two places and mean the same thing to the graph: inline
 * `#tags` in the prose and a `tags:` list in optional frontmatter. People and
 * sources have no inline syntax — there is no `@person` in this vault — so
 * frontmatter is the only way a body can express them.
 *
 * Hence `string[] | null`, and the one rule that governs the whole save path:
 *
 *   a save rewrites everything the body talks about, and leaves alone what the
 *   body does not mention.
 *
 * `null` is "the body said nothing about this", which is not the same as `[]`,
 * "this note has none". Deleting a `#tag` or a `[[link]]` from the prose
 * removes it, because the prose is where those live. But a note whose entities
 * only ever existed in frontmatter must not lose them because somebody fixed a
 * typo in the editor — that would quietly dismantle the graph one edit at a
 * time. An explicit `tags: []` or `people: []` still clears them.
 *
 * This stays idempotent: preserved values are read from the graph the save is
 * about to rewrite, so saving the same body twice lands on the same graph.
 */
function parseNote(raw: string): ParsedNote {
  let body = raw
  let front: Record<string, unknown> = {}

  // Frontmatter is optional and user-typed, so malformed YAML must degrade to
  // "no frontmatter" rather than fail the save. A body that merely *opens* with
  // a `---` horizontal rule is not frontmatter either: if the block yields no
  // keys, the original text is kept rather than silently swallowed.
  if (/^---\r?\n/.test(raw)) {
    try {
      const parsed = matter(raw)
      if (Object.keys(parsed.data ?? {}).length > 0) {
        body = parsed.content
        front = parsed.data as Record<string, unknown>
      }
    } catch {
      front = {}
    }
  }

  body = body.trim()
  const parsed = parseBody(body)

  const declaresTags = 'tags' in front || parsed.tags.length > 0
  const tags = [...new Set([...toList(front.tags), ...parsed.tags].map(normaliseTag))].filter(Boolean)

  return {
    body,
    links: parsed.links,
    tags: declaresTags ? tags : null,
    people: 'people' in front ? [...new Set(toList(front.people))] : null,
    sources: 'sources' in front ? [...new Set(toList(front.sources))] : null,
    wordCount: parsed.wordCount,
  }
}

/**
 * Every folder on the way to `path`, so `Books/Stoicism` creates `Books` too
 * and the tree query has an unbroken CHILD_OF chain to walk.
 */
function folderChain(folder: string): { path: string; name: string; parent: string | null }[] {
  const segments = folder
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..')

  return segments.map((_, i) => {
    const path = segments.slice(0, i + 1).join('/')
    return {
      path,
      name: segments[i],
      parent: i === 0 ? null : segments.slice(0, i).join('/'),
    }
  })
}

/** Row shape of the full-note projection, read back at the end of a save. */
type NoteRow = NoteSummaryRow & {
  body: string | null
  createdAt: string | null
  people: (string | null)[] | null
  sources: (string | null)[] | null
}

function toNote(row: NoteRow): Note {
  return {
    ...toSummary(row),
    body: row.body ?? '',
    createdAt: row.createdAt ?? row.updatedAt ?? '',
    people: (row.people ?? []).filter((p): p is string => typeof p === 'string').sort(),
    sources: (row.sources ?? []).filter((s): s is string => typeof s === 'string').sort(),
  }
}

/** The transaction runner handed to us by `runTransaction`. */
type Run = (cypher: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>[]>

/**
 * The actual write, inside somebody else's transaction.
 *
 * WHY DELETE-AND-RECREATE RATHER THAN DIFF: the note's outgoing relationships
 * are not state the user edits, they are a *projection of the body*. Diffing
 * would mean computing which links were added and which removed, and getting
 * that wrong in either direction is invisible until the graph is subtly wrong:
 * a removed `[[link]]` that still shows up in the target's backlinks panel, or
 * a tag that survives being deleted from the prose. Tearing the projection
 * down and rebuilding it from the parsed body makes saving idempotent by
 * construction — the graph after a save depends only on the body, never on the
 * order or number of saves that came before it. The whole rewrite is one
 * transaction, so nothing outside it ever observes the torn-down half.
 */
async function writeNote(run: Run, slug: string, input: NoteInput, now: string): Promise<Note> {
  const parsed = parseNote(input.body ?? '')
  const title = (input.title ?? '').trim() || slug
  const folder = (input.folder ?? '').trim().replace(/^\/+|\/+$/g, '')
  const folders = folderChain(folder)

  // Link targets are MERGEd below, so a link to a note that does not exist yet
  // creates a stub. A note linking to itself is noise, not an edge.
  const links = parsed.links
    .filter((link) => link.targetSlug && link.targetSlug !== slug)
    .map((link) => ({ targetSlug: link.targetSlug, target: link.target, context: link.context }))

  /* 0. What the graph already knows, so the rewrite can keep whatever this
   *    body does not talk about. See `parseNote` for why that matters. */
  const [existing] = await run(
    `MATCH (n:Note {slug: $slug})
     RETURN [(n)-[:TAGGED]->(t:Tag)       | t.name]  AS tags,
            [(n)-[:MENTIONS]->(p:Person)  | p.name]  AS people,
            [(n)-[:CITES]->(s:Source)     | s.title] AS sources
     LIMIT 1`,
    { slug },
  )

  const kept = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

  const tags = parsed.tags ?? kept(existing?.tags)
  const people = parsed.people ?? kept(existing?.people)
  const sources = parsed.sources ?? kept(existing?.sources)

  /* 1. The note itself. createdAt is only ever written once. */
  await run(
    `MERGE (n:Note {slug: $slug})
     ON CREATE SET n.createdAt = $now
     SET n.id        = $slug,
         n.title     = $title,
         n.body      = $body,
         n.updatedAt = $now,
         n.wordCount = $wordCount,
         n.stub      = false,
         n.createdAt = coalesce(n.createdAt, $now)`,
    { slug, title, body: parsed.body, now, wordCount: parsed.wordCount },
  )

  /* 2. Tear down the old projection of the body, including its filing. */
  await run(
    `MATCH (n:Note {slug: $slug})-[r:LINKS_TO|TAGGED|MENTIONS|CITES|IN_FOLDER]->()
     DELETE r`,
    { slug },
  )

  /* 3. Rebuild it. Missing link targets become stubs, and the sentence the
   *    link appeared in is stored on the relationship — it belongs to the link,
   *    not to either note, which is what makes the backlinks panel readable. */
  await run(
    `MATCH (n:Note {slug: $slug})
     UNWIND $links AS l
     MERGE (target:Note {slug: l.targetSlug})
       ON CREATE SET target.id        = l.targetSlug,
                     target.title     = l.target,
                     target.body      = '',
                     target.createdAt = $now,
                     target.updatedAt = $now,
                     target.wordCount = 0,
                     target.stub      = true
     MERGE (n)-[rel:LINKS_TO]->(target)
     SET rel.context = l.context, rel.createdAt = $now`,
    { slug, links, now },
  )

  await run(
    `MATCH (n:Note {slug: $slug})
     UNWIND $tags AS name
     MERGE (t:Tag {name: name})
     MERGE (n)-[:TAGGED]->(t)`,
    { slug, tags },
  )

  await run(
    `MATCH (n:Note {slug: $slug})
     UNWIND $people AS name
     MERGE (p:Person {name: name})
     MERGE (n)-[:MENTIONS]->(p)`,
    { slug, people },
  )

  await run(
    `MATCH (n:Note {slug: $slug})
     UNWIND $sources AS title
     MERGE (s:Source {title: title})
     MERGE (n)-[:CITES]->(s)`,
    { slug, sources },
  )

  /* 4. Re-attach the folder, creating any ancestor that does not exist yet. */
  if (folders.length > 0) {
    await run(
      `UNWIND $folders AS f
       MERGE (folder:Folder {path: f.path})
       SET folder.name = f.name`,
      { folders },
    )
    await run(
      `UNWIND $folders AS f
       WITH f WHERE f.parent IS NOT NULL
       MATCH (child:Folder {path: f.path})
       MATCH (parent:Folder {path: f.parent})
       MERGE (child)-[:CHILD_OF]->(parent)`,
      { folders },
    )
    await run(
      `MATCH (n:Note {slug: $slug})
       MATCH (folder:Folder {path: $folder})
       MERGE (n)-[:IN_FOLDER]->(folder)`,
      { slug, folder },
    )
  }

  /* 5. A tag nobody uses is not a tag. Sweeping here keeps the tag cloud from
   *    filling up with counts of zero as notes are edited. People and sources
   *    are left alone: they carry metadata and AUTHORED_BY edges of their own. */
  await run(`MATCH (t:Tag) WHERE NOT (t)<-[:TAGGED]-() DELETE t`, {})

  /* 6. Read the note back through the same projection the GET route uses, so
   *    the client renders exactly what was committed. */
  const rows = await run(
    `MATCH (n:Note {slug: $slug})
     RETURN
       n.slug                                        AS slug,
       n.title                                       AS title,
       head([(n)-[:IN_FOLDER]->(f:Folder) | f.path]) AS folder,
       [(n)-[:TAGGED]->(t:Tag) | t.name]             AS tags,
       n.updatedAt                                   AS updatedAt,
       n.wordCount                                   AS wordCount,
       n.stub                                        AS stub,
       n.body                                        AS body,
       n.createdAt                                   AS createdAt,
       [(n)-[:MENTIONS]->(p:Person) | p.name]        AS people,
       [(n)-[:CITES]->(s:Source)    | s.title]       AS sources
     LIMIT 1`,
    { slug },
  )

  const row = rows[0] as unknown as NoteRow | undefined
  if (!row) {
    // Unreachable: the note was MERGEd three statements ago inside this same
    // transaction. Failing loudly beats returning a half-invented Note.
    throw new Error(`Note "${slug}" disappeared during save.`)
  }
  return toNote(row)
}

/**
 * Save a note: create it if it is new, replace its body and its whole outgoing
 * neighbourhood if it is not. One transaction, so the graph is never observed
 * mid-rewrite.
 *
 * Saving the same body twice produces the same graph — see `writeNote` for why
 * that is worth the delete-and-recreate.
 */
export async function saveNote(slug: string, input: NoteInput): Promise<Note> {
  const now = new Date().toISOString()
  return runTransaction((run) => writeNote(run, slug, input, now))
}

/**
 * A create either happened, collided with an existing note, or was given a
 * title with no letters or digits in it — `!!!` slugifies to the empty string,
 * which is not an identity a note can have.
 */
export type CreateResult =
  | { ok: true; note: Note }
  | { ok: false; reason: 'CONFLICT' | 'INVALID_TITLE' }

/**
 * Create a note from a title.
 *
 * A slug that already belongs to a real note is a conflict — silently
 * overwriting somebody's note would be the worst possible answer. A slug that
 * belongs to a *stub* is adopted instead: the stub exists only because another
 * note linked to it, so filling it in is precisely what the user is asking for,
 * and it is what makes clicking an unresolved link and writing it feel like one
 * continuous action rather than an error to route around.
 *
 * The check runs inside the same transaction as the write, so two concurrent
 * creates of the same title cannot both win.
 */
export async function createNote(input: NoteInput): Promise<CreateResult> {
  const slug = slugify(input.title)
  if (!slug) return { ok: false, reason: 'INVALID_TITLE' }

  const now = new Date().toISOString()
  return runTransaction<CreateResult>(async (run) => {
    const [existing] = await run(
      `MATCH (n:Note {slug: $slug}) RETURN n.stub AS stub LIMIT 1`,
      { slug },
    )
    if (existing && existing.stub !== true) return { ok: false, reason: 'CONFLICT' }

    return { ok: true, note: await writeNote(run, slug, input, now) }
  })
}

/**
 * Delete a note, or hollow it out if other notes still point at it.
 *
 * A note with inbound links cannot simply vanish: every one of those links
 * would dangle, and the notes carrying them would suddenly reference nothing.
 * So it becomes a stub — the same greyed-out unresolved link you would get by
 * typing `[[a note that isn't written yet]]`. The body goes, the outgoing
 * relationships go, the inbound links survive and stay meaningful.
 *
 * Returns `false` when the slug does not exist, which the route turns into 404.
 */
export async function deleteNote(slug: string): Promise<boolean> {
  const now = new Date().toISOString()
  return runTransaction<boolean>(async (run) => {
    const [found] = await run(
      `MATCH (n:Note {slug: $slug})
       RETURN size([(n)<-[:LINKS_TO]-() | 1]) AS inbound
       LIMIT 1`,
      { slug },
    )
    if (!found) return false

    const inbound = typeof found.inbound === 'number' ? found.inbound : 0

    if (inbound > 0) {
      await run(
        `MATCH (n:Note {slug: $slug})
         SET n.body      = '',
             n.wordCount = 0,
             n.stub      = true,
             n.updatedAt = $now`,
        { slug, now },
      )
      await run(
        `MATCH (n:Note {slug: $slug})-[r:LINKS_TO|TAGGED|MENTIONS|CITES|IN_FOLDER]->()
         DELETE r`,
        { slug },
      )
    } else {
      await run(`MATCH (n:Note {slug: $slug}) DETACH DELETE n`, { slug })
    }

    await run(`MATCH (t:Tag) WHERE NOT (t)<-[:TAGGED]-() DELETE t`, {})
    return true
  })
}
