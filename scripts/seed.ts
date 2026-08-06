/**
 * Load the markdown vault in seed/vault/ into the graph.
 *
 * The vault on disk is the source of truth: real .md files with frontmatter and
 * [[wikilinks]], parsed by exactly the same code the app's save path uses. Run
 * it as many times as you like — it wipes and rebuilds, so it is idempotent.
 *
 *   npm run seed
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

import { closeDriver, ping, runQuery, runWrite, toDbError } from '../lib/db'
import { normaliseTag, parseBody, slugify } from '../lib/wikilink'

const VAULT_DIR = path.join(process.cwd(), 'seed', 'vault')
const ENTITIES_FILE = path.join(process.cwd(), 'seed', 'entities.json')

/* ------------------------------------------------------------------ types */

interface SeedNote {
  slug: string
  title: string
  body: string
  folder: string
  tags: string[]
  people: string[]
  sources: string[]
  createdAt: string
  updatedAt: string
  wordCount: number
}

interface SeedLink {
  fromSlug: string
  toSlug: string
  toTitle: string
  context: string
}

interface EntityFile {
  people?: { name: string; role?: string }[]
  sources?: { title: string; type?: string; url?: string; authors?: string[] }[]
}

/* ---------------------------------------------------------------- reading */

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return findMarkdownFiles(full)
      return entry.isFile() && entry.name.endsWith('.md') ? [full] : []
    }),
  )
  return files.flat()
}

/**
 * Normalise a frontmatter value that may be a list, a comma string, or absent.
 *
 * The object branch is a guard, not a nicety: an unquoted YAML flow sequence
 * containing a colon — `sources: [Thinking in Systems: A Primer]` — parses as a
 * map, and blindly stringifying it yields "[object Object]". Every such title
 * then MERGEs onto the same node, silently merging unrelated sources. Rebuilding
 * "key: value" recovers the intended title instead of corrupting the graph.
 */
function toEntry(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > 0) {
      return entries.map(([k, v]) => (v == null ? k : `${k}: ${v}`)).join(', ').trim()
    }
  }
  return String(value).trim()
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(toEntry).filter(Boolean)
  if (value && typeof value === 'object') return [toEntry(value)].filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * A daily note titled `2026-01-08` is parsed by YAML as a Date, not a string.
 * Stringifying that gives "Thu Jan 08 2026 05:00:00 GMT+0500 (...)", which
 * becomes both the displayed title and — via slugify — the note's identity, so
 * every `[[2026-01-08]]` link silently fails to resolve. Dates render back to
 * the ISO day they were written as.
 */
function toTitle(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const title = String(value ?? fallback).trim()
  return title || fallback
}

function toIsoDate(value: unknown, fallback: string): string {
  if (!value) return fallback
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

async function readVault(): Promise<{ notes: SeedNote[]; links: SeedLink[] }> {
  if (!existsSync(VAULT_DIR)) {
    throw new Error(
      `No vault found at ${VAULT_DIR}. The seed vault markdown files are missing.`,
    )
  }

  const files = await findMarkdownFiles(VAULT_DIR)
  if (files.length === 0) {
    throw new Error(`No .md files found under ${VAULT_DIR}.`)
  }

  const notes: SeedNote[] = []
  const links: SeedLink[] = []
  const seen = new Map<string, string>()

  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const { data, content } = matter(raw)

    const relative = path.relative(VAULT_DIR, file)
    const folder = path.dirname(relative).replace(/\\/g, '/')
    const title = toTitle(data.title, path.basename(file, '.md'))
    const slug = slugify(String(data.slug ?? title))

    if (!slug) {
      console.warn(`  skipped (no usable slug): ${relative}`)
      continue
    }
    if (seen.has(slug)) {
      console.warn(`  skipped duplicate slug "${slug}": ${relative} (kept ${seen.get(slug)})`)
      continue
    }
    seen.set(slug, relative)

    const parsed = parseBody(content)
    const created = toIsoDate(data.created, new Date('2024-01-01').toISOString())

    notes.push({
      slug,
      title,
      body: content.trim(),
      folder: folder === '.' ? '' : folder,
      // Frontmatter tags and inline #tags are the same thing to the graph.
      tags: [...new Set([...toList(data.tags), ...parsed.tags].map(normaliseTag))].filter(Boolean),
      people: toList(data.people),
      sources: toList(data.sources),
      createdAt: created,
      updatedAt: toIsoDate(data.updated, created),
      wordCount: parsed.wordCount,
    })

    for (const link of parsed.links) {
      if (link.targetSlug === slug) continue // self-links are noise
      links.push({
        fromSlug: slug,
        toSlug: link.targetSlug,
        toTitle: link.target,
        context: link.context,
      })
    }
  }

  return { notes, links }
}

async function readEntities(): Promise<EntityFile> {
  if (!existsSync(ENTITIES_FILE)) return {}
  try {
    return JSON.parse(await readFile(ENTITIES_FILE, 'utf8')) as EntityFile
  } catch (err) {
    console.warn(`  could not parse seed/entities.json, using bare entities:`, err)
    return {}
  }
}

/** Every folder path implied by the notes, including intermediate ancestors. */
function deriveFolders(notes: SeedNote[]): { path: string; name: string; parent: string | null }[] {
  const paths = new Set<string>()
  for (const note of notes) {
    if (!note.folder) continue
    const segments = note.folder.split('/')
    for (let i = 1; i <= segments.length; i++) {
      paths.add(segments.slice(0, i).join('/'))
    }
  }
  return [...paths].sort().map((p) => {
    const segments = p.split('/')
    return {
      path: p,
      name: segments[segments.length - 1],
      parent: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
    }
  })
}

/* ---------------------------------------------------------------- writing */

/**
 * Constraints make MERGE correct under concurrency and give the planner an
 * index to seek on. CognoDB does not document its DDL, so a failure here is
 * logged and tolerated — the app must work without them.
 */
async function createConstraints(): Promise<void> {
  const constraints = [
    'CREATE CONSTRAINT note_slug IF NOT EXISTS FOR (n:Note) REQUIRE n.slug IS UNIQUE',
    'CREATE CONSTRAINT folder_path IF NOT EXISTS FOR (f:Folder) REQUIRE f.path IS UNIQUE',
    'CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE',
    'CREATE CONSTRAINT person_name IF NOT EXISTS FOR (p:Person) REQUIRE p.name IS UNIQUE',
    'CREATE CONSTRAINT source_title IF NOT EXISTS FOR (s:Source) REQUIRE s.title IS UNIQUE',
  ]

  let created = 0
  for (const cypher of constraints) {
    try {
      await runWrite(cypher, {})
      created++
    } catch (err) {
      console.warn(`  constraint skipped: ${(err as Error).message.split('\n')[0]}`)
    }
  }
  console.log(`  ${created}/${constraints.length} constraints in place`)
}

/**
 * Full-text search is advertised by CognoDB but its syntax is not documented,
 * so the index is attempted and the query layer falls back to CONTAINS if it
 * is not there.
 */
async function createSearchIndex(): Promise<void> {
  try {
    await runWrite(
      'CREATE FULLTEXT INDEX note_search IF NOT EXISTS FOR (n:Note) ON EACH [n.title, n.body]',
      {},
    )
  } catch {
    console.log('  full-text index not supported — search will use CONTAINS fallback')
    return
  }

  /*
   * Creating the index is not proof it works. CognoDB accepts the DDL without
   * complaint and then refuses to query the index ("fulltext indexes are not
   * available on this server"), so reporting success on the write alone was
   * actively misleading. Query it once and report what is really true.
   */
  try {
    await runQuery(
      `CALL db.index.fulltext.queryNodes('note_search', $probe) YIELD node RETURN node LIMIT 1`,
      { probe: 'practice' },
    )
    console.log('  full-text index created and queryable')
  } catch {
    console.log('  full-text index not queryable here — search will use CONTAINS fallback')
  }
}

async function wipe(): Promise<void> {
  // Small vault, so a single DETACH DELETE is fine and keeps the script honest
  // about being a full rebuild rather than an incremental sync.
  await runWrite('MATCH (n) DETACH DELETE n', {})
}

async function loadGraph(
  notes: SeedNote[],
  links: SeedLink[],
  entities: EntityFile,
): Promise<void> {
  const folders = deriveFolders(notes)

  await runWrite(
    `UNWIND $folders AS f
     MERGE (folder:Folder {path: f.path})
     SET folder.name = f.name`,
    { folders },
  )

  await runWrite(
    `UNWIND $folders AS f
     WITH f WHERE f.parent IS NOT NULL
     MATCH (child:Folder {path: f.path})
     MATCH (parent:Folder {path: f.parent})
     MERGE (child)-[:CHILD_OF]->(parent)`,
    { folders },
  )

  await runWrite(
    `UNWIND $notes AS n
     MERGE (note:Note {slug: n.slug})
     SET note.id        = n.slug,
         note.title     = n.title,
         note.body      = n.body,
         note.createdAt = n.createdAt,
         note.updatedAt = n.updatedAt,
         note.wordCount = n.wordCount,
         note.stub      = false
     WITH note, n WHERE n.folder <> ''
     MATCH (folder:Folder {path: n.folder})
     MERGE (note)-[:IN_FOLDER]->(folder)`,
    { notes },
  )

  await runWrite(
    `UNWIND $notes AS n
     MATCH (note:Note {slug: n.slug})
     UNWIND n.tags AS tagName
     MERGE (tag:Tag {name: tagName})
     MERGE (note)-[:TAGGED]->(tag)`,
    { notes: notes.filter((n) => n.tags.length > 0) },
  )

  await runWrite(
    `UNWIND $notes AS n
     MATCH (note:Note {slug: n.slug})
     UNWIND n.people AS personName
     MERGE (person:Person {name: personName})
     MERGE (note)-[:MENTIONS]->(person)`,
    { notes: notes.filter((n) => n.people.length > 0) },
  )

  await runWrite(
    `UNWIND $notes AS n
     MATCH (note:Note {slug: n.slug})
     UNWIND n.sources AS sourceTitle
     MERGE (source:Source {title: sourceTitle})
     MERGE (note)-[:CITES]->(source)`,
    { notes: notes.filter((n) => n.sources.length > 0) },
  )

  // Enrich entities that the manifest knows more about than the frontmatter does.
  if (entities.people?.length) {
    await runWrite(
      `UNWIND $people AS p
       MERGE (person:Person {name: p.name})
       SET person.role = p.role`,
      { people: entities.people },
    )
  }

  if (entities.sources?.length) {
    await runWrite(
      `UNWIND $sources AS s
       MERGE (source:Source {title: s.title})
       SET source.type = s.type, source.url = s.url`,
      { sources: entities.sources },
    )
    await runWrite(
      `UNWIND $sources AS s
       MATCH (source:Source {title: s.title})
       UNWIND s.authors AS authorName
       MERGE (person:Person {name: authorName})
       MERGE (source)-[:AUTHORED_BY]->(person)`,
      { sources: entities.sources.filter((s) => s.authors?.length) },
    )
  }

  /*
   * Links come last, and MERGE the target rather than MATCHing it. A link to a
   * note that has not been written yet creates a stub — Obsidian's greyed-out
   * unresolved link — which is exactly the behaviour we want and falls out of
   * the graph model for free.
   */
  await runWrite(
    `UNWIND $links AS l
     MATCH (from:Note {slug: l.fromSlug})
     MERGE (to:Note {slug: l.toSlug})
       ON CREATE SET to.id        = l.toSlug,
                     to.title     = l.toTitle,
                     to.body      = '',
                     to.createdAt = $now,
                     to.updatedAt = $now,
                     to.wordCount = 0,
                     to.stub      = true
     MERGE (from)-[rel:LINKS_TO]->(to)
     SET rel.context = l.context, rel.createdAt = $now`,
    { links, now: new Date().toISOString() },
  )
}

async function report(): Promise<void> {
  /*
   * Deliberately one query per count rather than a chain of MATCH clauses.
   * Chained MATCHes multiply: a pattern matching zero rows — no stubs, no
   * sources — terminates the whole query and returns nothing at all, which
   * reads as a crash rather than as a zero.
   */
  const count = async (cypher: string): Promise<number> => {
    const [row] = await runWrite<{ n: number }>(cypher, {})
    return row?.n ?? 0
  }

  const counts = {
    notes: await count('MATCH (n:Note) RETURN count(n) AS n'),
    stubs: await count('MATCH (n:Note {stub: true}) RETURN count(n) AS n'),
    folders: await count('MATCH (f:Folder) RETURN count(f) AS n'),
    tags: await count('MATCH (t:Tag) RETURN count(t) AS n'),
    people: await count('MATCH (p:Person) RETURN count(p) AS n'),
    sources: await count('MATCH (s:Source) RETURN count(s) AS n'),
    links: await count('MATCH ()-[l:LINKS_TO]->() RETURN count(l) AS n'),
    authored: await count('MATCH ()-[a:AUTHORED_BY]->() RETURN count(a) AS n'),
  }

  console.log('\nVault loaded:')
  console.log(`  ${counts.notes} notes (${counts.stubs} unresolved stubs)`)
  console.log(`  ${counts.links} links`)
  console.log(`  ${counts.folders} folders · ${counts.tags} tags · ${counts.people} people · ${counts.sources} sources`)
  console.log(`  ${counts.authored} source→author links`)

  const avgLinks = counts.notes > 0 ? (counts.links / counts.notes).toFixed(1) : '0'
  console.log(`  ${avgLinks} links per note`)
  if (Number(avgLinks) < 2) {
    console.warn(
      '\n  WARNING: link density is low. Multi-hop traversal and suggested links will\n' +
        '  return thin results, which makes the demo look broken rather than sparse.',
    )
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  console.log('Seeding vault\n')

  console.log('Connecting...')
  await ping()
  console.log('  connected')

  console.log('Reading markdown...')
  const { notes, links } = await readVault()
  const entities = await readEntities()
  console.log(`  ${notes.length} notes, ${links.length} links parsed from disk`)

  console.log('Preparing schema...')
  await createConstraints()

  console.log('Clearing existing data...')
  await wipe()

  console.log('Writing graph...')
  await loadGraph(notes, links, entities)

  await createSearchIndex()
  await report()
}

main()
  .then(() => closeDriver())
  .catch(async (err) => {
    const dbErr = toDbError(err)
    console.error(`\nSeed failed [${dbErr.code}]: ${dbErr.message}`)
    await closeDriver()
    process.exit(1)
  })
