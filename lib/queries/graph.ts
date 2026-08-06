/**
 * Traversal queries — the part of the app that would be painful without a
 * graph database.
 *
 * Three constraints shape everything in this file:
 *
 *   1. Every Cypher string here is a plain literal with `$params`. Nothing is
 *      interpolated or concatenated into a query, anywhere, ever — including
 *      "safe" values like a constant list of relationship types. Query text is
 *      static; only parameters vary.
 *
 *   2. A variable-length bound cannot be parameterised: `*1..$depth` is
 *      illegal Cypher. So the pattern carries a *literal* ceiling of 3 and the
 *      requested depth is applied as an ordinary predicate,
 *      `WHERE length(trail) <= $depth`. The planner walks at most 3 hops; the
 *      parameter narrows the result within that.
 *
 *   3. Relationship *types* cannot be parameterised inside a pattern either.
 *      Where the pattern is fixed, the types are written out literally. Where
 *      the caller chooses (the global graph), the pattern matches any
 *      relationship and `WHERE type(r) IN $types` does the filtering.
 *
 * Node identity is `kind:key`, where the key is whichever property makes that
 * label unique — slug for notes, path for folders, name for tags and people,
 * title for sources. Building it in one helper means nodes and edges can never
 * disagree about what a node is called.
 */

import { runQuery } from '../db'
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  NodeKind,
  PathResult,
  PathStep,
  RelType,
} from '../types'

/* --------------------------------------------------------------- constants */

/** Every relationship type, used when the caller does not narrow the graph. */
export const ALL_REL_TYPES: readonly RelType[] = [
  'LINKS_TO',
  'TAGGED',
  'IN_FOLDER',
  'CHILD_OF',
  'MENTIONS',
  'CITES',
  'AUTHORED_BY',
]

const NODE_KINDS: readonly string[] = ['Note', 'Folder', 'Tag', 'Person', 'Source']

/* --------------------------------------------------------------- helpers */

/**
 * The graph pane only ever asks for 1, 2 or 3 hops, and the Cypher ceiling is
 * a literal 3. Clamping here — not only at the route — means a caller asking
 * for 12 gets a sane picture instead of silently getting 3, and a caller
 * asking for 0 or NaN gets 1 instead of an empty pane.
 */
export function clampDepth(depth: number | undefined): number {
  if (depth === undefined || !Number.isFinite(depth)) return 1
  return Math.min(3, Math.max(1, Math.trunc(depth)))
}

function toKind(label: string | null): NodeKind {
  return label !== null && NODE_KINDS.includes(label) ? (label as NodeKind) : 'Note'
}

function toRelType(type: string): RelType {
  return (ALL_REL_TYPES as readonly string[]).includes(type) ? (type as RelType) : 'LINKS_TO'
}

function nodeId(kind: string, key: string): string {
  return kind + ':' + key
}

/** One row of the node projection shared by the local and global graph queries. */
interface GraphNodeRow {
  kind: string | null
  key: string | null
  label: string | null
  degree: number | null
  stub: boolean | null
  slug: string | null
  out: { targetKind: string | null; targetKey: string | null; type: string }[] | null
}

/**
 * Turn node rows — each carrying its own outgoing edges — into deduped
 * GraphData. Edges are emitted once, from their source node's row, so the only
 * real duplication risk is parallel relationships of the same type; guarded
 * anyway, because the force graph would draw them on top of each other.
 */
function toGraphData(rows: GraphNodeRow[]): GraphData {
  const nodes: GraphNode[] = []
  const seenNodes = new Set<string>()
  const rawEdges: GraphEdge[] = []

  for (const row of rows) {
    if (row.key === null) continue
    const kind = toKind(row.kind)
    const id = nodeId(kind, row.key)

    if (!seenNodes.has(id)) {
      seenNodes.add(id)
      nodes.push({
        id,
        label: row.label ?? row.key,
        kind,
        degree: row.degree ?? 0,
        ...(kind === 'Note' ? { stub: row.stub === true, slug: row.slug ?? row.key } : {}),
      })
    }

    for (const edge of row.out ?? []) {
      if (edge.targetKey === null) continue
      rawEdges.push({
        source: id,
        target: nodeId(toKind(edge.targetKind), edge.targetKey),
        type: toRelType(edge.type),
      })
    }
  }

  // A dangling edge makes the force graph silently drop links, so anything
  // pointing outside the returned node set is discarded rather than rendered.
  const edges: GraphEdge[] = []
  const seenEdges = new Set<string>()
  for (const edge of rawEdges) {
    const key = [edge.source, edge.type, edge.target].join('\u0000')
    if (seenEdges.has(key)) continue
    if (!seenNodes.has(edge.source) || !seenNodes.has(edge.target)) continue
    seenEdges.add(key)
    edges.push(edge)
  }

  return { nodes, edges }
}

/* ------------------------------------------------------------ local graph */

/**
 * 2. THE MULTI-HOP QUERY — the neighbourhood around one note, out to `depth`
 *    hops, across links, tags, people and sources.
 *
 * Why a graph fits: this is the query the whole app is built on. "Everything
 * within three hops of this note, following four different kinds of
 * relationship, in either direction" is a single pattern here. In SQL it is
 * chained self-joins per relationship type — and because hops mix types freely
 * (note → tag → note → person → note), the join permutations explode
 * combinatorially. A recursive CTE gets there but must union every junction
 * table at each level, carry a visited-set, and dedupe by hand. Here the
 * traversal *is* the index: the database follows pointers it already holds.
 *
 * The literal `*1..3` ceiling with `WHERE length(trail) <= $depth` is the
 * point-2 workaround described at the top of this file. Depth is clamped to
 * 1..3 before it reaches the database, so the predicate can never ask for more
 * than the pattern can produce.
 *
 * Only the four *semantic* relationship types are traversed. IN_FOLDER and
 * CHILD_OF are filing, not thought; including them would connect every note in
 * a folder to every other one and flatten the picture into a hairball.
 *
 * `degree` is total incident edges across those four types, computed with
 * pattern comprehension — `size([(n)-[:...]-() | 1])` rather than `count {}`,
 * because CognoDB does not publish its Cypher version and pattern
 * comprehension is valid on both 4.x and 5.x. It drives node radius.
 *
 * An unknown slug returns an empty graph rather than throwing: the pane
 * renders an empty state, which is the correct answer to "show me the
 * neighbourhood of a note that isn't there".
 */
export async function getLocalGraph(slug: string, depth: number = 1): Promise<GraphData> {
  const rows = await runQuery<GraphNodeRow>(
    `MATCH (root:Note {slug: $slug})
     OPTIONAL MATCH trail = (root)-[:LINKS_TO|TAGGED|MENTIONS|CITES*1..3]-(reached)
     WHERE length(trail) <= $depth
     WITH root, collect(DISTINCT reached) AS reachedNodes
     WITH root, [x IN reachedNodes WHERE x <> root] AS others
     WITH [root] + others AS members
     UNWIND members AS n
     RETURN
       labels(n)[0]                                        AS kind,
       coalesce(n.slug, n.path, n.name, n.title)           AS key,
       coalesce(n.title, n.name, n.path)                   AS label,
       size([(n)-[:LINKS_TO|TAGGED|MENTIONS|CITES]-() | 1]) AS degree,
       n.stub                                              AS stub,
       n.slug                                              AS slug,
       [(n)-[r:LINKS_TO|TAGGED|MENTIONS|CITES]->(m) WHERE m IN members |
          { targetKind: labels(m)[0],
            targetKey:  coalesce(m.slug, m.path, m.name, m.title),
            type:       type(r) }]                         AS out`,
    { slug, depth: clampDepth(depth) },
  )

  return toGraphData(rows)
}

/* ----------------------------------------------------------- global graph */

/**
 * 9. The whole vault as one picture, optionally narrowed to certain
 *    relationship types.
 *
 * Why a graph fits: "every node and every edge" is the shape the data is
 * already stored in. There is no assembly step — no UNION across five entity
 * tables and seven join tables to produce one uniform node/edge list, and no
 * per-table id-namespacing to stop a tag colliding with a note.
 *
 * Relationship types cannot be parameterised inside a pattern, so the pattern
 * is untyped and `WHERE type(r) IN $types` filters. Notes are always included
 * — an orphan note with no edges is exactly what the user wants to see — but
 * tags, people, sources and folders appear only when they have at least one
 * edge of a selected type; otherwise filtering to LINKS_TO would litter the
 * canvas with disconnected tag dots.
 *
 * Because the node filter and the edge filter share the same predicate, every
 * edge returned is guaranteed to have both endpoints in the node set.
 */
export async function getGlobalGraph(types?: RelType[]): Promise<GraphData> {
  const selected = types && types.length > 0 ? types : [...ALL_REL_TYPES]

  const rows = await runQuery<GraphNodeRow>(
    `MATCH (n)
     WHERE (n:Note OR n:Folder OR n:Tag OR n:Person OR n:Source)
       AND (n:Note OR size([(n)-[r]-() WHERE type(r) IN $types | 1]) > 0)
     RETURN
       labels(n)[0]                                    AS kind,
       coalesce(n.slug, n.path, n.name, n.title)       AS key,
       coalesce(n.title, n.name, n.path)               AS label,
       size([(n)-[r]-() WHERE type(r) IN $types | 1])  AS degree,
       n.stub                                          AS stub,
       n.slug                                          AS slug,
       [(n)-[r]->(m) WHERE type(r) IN $types |
          { targetKind: labels(m)[0],
            targetKey:  coalesce(m.slug, m.path, m.name, m.title),
            type:       type(r) }]                     AS out`,
    { types: selected },
  )

  return toGraphData(rows)
}

/* ------------------------------------------------------------ path finder */

/**
 * 3. THE QUERY THAT IS AWKWARD IN SQL — how are these two notes connected?
 *
 * Why a graph fits: shortest path is a first-class operation here. One clause,
 * `shortestPath((from)-[...*1..8]-(to))`, and the engine runs a bidirectional
 * breadth-first search that stops the moment the two frontiers meet. The
 * relational equivalent is a recursive CTE that unions four relationship
 * tables at every level, carries a visited-set to avoid cycling, materialises
 * every path of length ≤ 8 in a graph where each level multiplies the row
 * count, then takes the minimum — and it still cannot tell you *which* edges
 * the winning path used without dragging the chain along as an array. This is
 * the query that justifies the storage choice.
 *
 * The traversal is undirected on purpose: "connected to" is symmetric, and
 * note → source ← note is a real connection even though the arrows disagree.
 *
 * TAGGED is deliberately excluded, and this is the single most important
 * decision in the query. A tag is a category, not a connection: with 25 tags
 * over ~190 notes, any two notes sharing one are two hops apart, so including
 * TAGGED makes almost every pair "connected" through a hub like #learning. The
 * answer is technically a path and tells the reader nothing. Restricting the
 * search to LINKS_TO, CITES, MENTIONS and AUTHORED_BY means a returned path is
 * always a specific claim — these notes cite the same book, or discuss the same
 * person — which is what makes the feature worth having.
 *
 * AUTHORED_BY is what lets a path cross from one cluster to another through a
 * writer rather than a topic: a note on mortality reaches a note on processing
 * an inbox via Seneca, who wrote the book one cites and is mentioned by the
 * other. That is the kind of connection nobody would find by hand.
 *
 * Returning `null` when nothing connects the two notes within 8 hops is a
 * normal result — two unrelated corners of a vault genuinely have no path —
 * and the UI says so rather than showing an error.
 */
export async function findPath(fromSlug: string, toSlug: string): Promise<PathResult | null> {
  /*
   * A note to itself is answered without touching shortestPath: the engine
   * refuses a search whose start and end are the same node and raises rather
   * than returning nothing. Picking the same note in both pickers is an easy
   * thing for a user to do, and the honest answer is a zero-hop path — the
   * note is trivially connected to itself — not a server error.
   */
  if (fromSlug === toSlug) {
    const rows = await runQuery<{ title: string | null; slug: string }>(
      `MATCH (n:Note {slug: $slug})
       RETURN n.title AS title, n.slug AS slug
       LIMIT 1`,
      { slug: fromSlug },
    )
    const self = rows[0]
    if (!self) return null
    return {
      chain: [{ label: self.title ?? self.slug, kind: 'Note', slug: self.slug }],
      hops: [],
      distance: 0,
    }
  }

  const rows = await runQuery<{
    chain: { label: string | null; kind: string | null; slug: string | null }[] | null
    hops: string[] | null
    distance: number | null
  }>(
    `MATCH (from:Note {slug: $fromSlug}), (to:Note {slug: $toSlug})
     MATCH trail = shortestPath((from)-[:LINKS_TO|CITES|MENTIONS|AUTHORED_BY*1..8]-(to))
     RETURN
       [node IN nodes(trail) |
          { label: coalesce(node.title, node.name, node.path),
            kind:  labels(node)[0],
            slug:  node.slug }]                    AS chain,
       [rel IN relationships(trail) | type(rel)]   AS hops,
       length(trail)                               AS distance
     LIMIT 1`,
    { fromSlug, toSlug },
  )

  const row = rows[0]
  if (!row) return null

  const chain: PathStep[] = (row.chain ?? []).map((step) => {
    const kind = toKind(step.kind)
    return {
      label: step.label ?? '',
      kind,
      ...(kind === 'Note' && step.slug ? { slug: step.slug } : {}),
    }
  })

  return {
    chain,
    hops: (row.hops ?? []).map(toRelType),
    distance: row.distance ?? Math.max(0, chain.length - 1),
  }
}
