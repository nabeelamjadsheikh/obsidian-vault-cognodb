/**
 * Whole-vault analytics: what is disconnected, what is central, how big it is.
 *
 * These are the queries that answer questions about the *shape* of the vault
 * rather than about any one note. All three are degree computations, which is
 * why they are short here and long in SQL.
 *
 * Degrees are read with pattern comprehension — `size([(n)-[:R]->() | 1])` —
 * rather than `count {}`. Both express the same thing on Neo4j 5, but CognoDB
 * does not publish which Cypher version it implements and pattern
 * comprehension is valid on 4.x and 5.x alike.
 */

import { runQuery } from '../db'
import type { HubNote, Insights, NoteSummary, VaultStats } from '../types'

/**
 * 5. Orphans — notes with no LINKS_TO in *or* out.
 *
 * Why a graph fits: "has no relationship of this type, in either direction" is
 * a single anti-pattern, `WHERE NOT (n)-[:LINKS_TO]-()`, evaluated straight
 * against the relationship store. The SQL version is a NOT EXISTS against a
 * links table checked twice — once per column — and it has to scan an index
 * that a graph does not need because adjacency is stored on the node itself.
 *
 * These are the notes the vault has forgotten about, which is exactly why they
 * are worth surfacing: an orphan is a thought with nowhere to go back to.
 * Stubs never appear here — a stub exists *because* something links to it.
 *
 * An empty list is a good result, not a broken query: it means every note is
 * connected to something.
 */
export async function getOrphans(): Promise<NoteSummary[]> {
  const rows = await runQuery<{
    slug: string
    title: string | null
    folder: string | null
    tags: (string | null)[] | null
    updatedAt: string | null
    wordCount: number | null
    stub: boolean | null
  }>(
    `MATCH (n:Note)
     WHERE NOT (n)-[:LINKS_TO]-()
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

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title ?? row.slug,
    folder: row.folder ?? null,
    tags: (row.tags ?? []).filter((t): t is string => typeof t === 'string').sort(),
    // Zero by definition — the query selects notes with no LINKS_TO either way.
    linkCount: 0,
    updatedAt: row.updatedAt ?? '',
    wordCount: row.wordCount ?? 0,
    stub: row.stub === true,
  }))
}

/**
 * 6. Hubs — the ten most connected notes, split into inbound and outbound
 *    degree.
 *
 * Why a graph fits: degree is not a computed aggregate here, it is a property
 * of how the data is stored. Two pattern comprehensions read the incoming and
 * outgoing link counts off each node without touching a second table, without
 * a `GROUP BY`, and without the two-subquery-plus-COALESCE dance SQL needs to
 * count both directions in one row.
 *
 * The in/out split is the interesting part: a note with high inbound degree is
 * a destination the vault keeps returning to, while high outbound degree marks
 * an index or map-of-content. Collapsing them into one total would hide that
 * distinction, so both are returned and the ranking uses the sum.
 *
 * Notes with no links at all are excluded — they are the orphan list, and a
 * "hub" with degree zero is noise at the bottom of a top-ten.
 */
export async function getHubs(): Promise<HubNote[]> {
  const rows = await runQuery<{
    slug: string
    title: string | null
    inbound: number | null
    outbound: number | null
  }>(
    `MATCH (n:Note)
     WITH n,
          size([(n)<-[:LINKS_TO]-() | 1]) AS inbound,
          size([(n)-[:LINKS_TO]->() | 1]) AS outbound
     WHERE inbound + outbound > 0
     RETURN n.slug  AS slug,
            n.title AS title,
            inbound,
            outbound
     ORDER BY inbound + outbound DESC, n.title
     LIMIT 10`,
    {},
  )

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title ?? row.slug,
    inbound: row.inbound ?? 0,
    outbound: row.outbound ?? 0,
  }))
}

/**
 * Headline counts for the status bar: notes, links, and every entity type.
 *
 * Why a graph fits: each count is a label or relationship-type scan, so the
 * whole thing is one round trip over data that is already partitioned by label
 * — no five-table UNION, no schema introspection.
 *
 * Every clause is an OPTIONAL MATCH on purpose. A plain MATCH that finds
 * nothing returns *no rows*, which would collapse the entire result to empty
 * and report a vault with zero notes just because it happens to have zero
 * sources. OPTIONAL MATCH yields one null row, and `count(null)` is 0 — so an
 * empty vault reports honest zeroes instead of nothing at all.
 */
export async function getStats(): Promise<VaultStats> {
  const rows = await runQuery<{
    notes: number | null
    stubs: number | null
    tags: number | null
    people: number | null
    sources: number | null
    links: number | null
  }>(
    `OPTIONAL MATCH (n:Note)
     WITH count(n) AS notes,
          count(CASE WHEN n.stub = true THEN 1 END) AS stubs
     OPTIONAL MATCH (t:Tag)
     WITH notes, stubs, count(t) AS tags
     OPTIONAL MATCH (p:Person)
     WITH notes, stubs, tags, count(p) AS people
     OPTIONAL MATCH (s:Source)
     WITH notes, stubs, tags, people, count(s) AS sources
     OPTIONAL MATCH ()-[l:LINKS_TO]->()
     RETURN notes, stubs, tags, people, sources, count(l) AS links`,
    {},
  )

  const row = rows[0]
  return {
    notes: row?.notes ?? 0,
    links: row?.links ?? 0,
    tags: row?.tags ?? 0,
    people: row?.people ?? 0,
    sources: row?.sources ?? 0,
    stubs: row?.stubs ?? 0,
  }
}

/**
 * The insights panel in one call.
 *
 * The three queries are independent, so they run concurrently rather than
 * serially — the panel is three round trips wide, not three round trips deep.
 */
export async function getInsights(): Promise<Insights> {
  const [orphans, hubs, stats] = await Promise.all([getOrphans(), getHubs(), getStats()])
  return { orphans, hubs, stats }
}
