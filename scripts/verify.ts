/**
 * Prove every query actually returns data before any UI is built on top of it.
 *
 * A Cypher query with a subtly wrong pattern does not throw — it returns zero
 * rows, and an empty panel looks identical to a feature that is merely quiet.
 * This script is what stands between "I wrote nine queries" and "nine queries
 * work", and it checks the two things the assignment names explicitly:
 *
 *   - at least one genuine multi-hop (2+) traversal
 *   - at least one query a relational schema would find awkward
 *
 *   npm run verify
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { closeDriver, ping, toDbError } from '../lib/db'
import {
  findPath,
  getBacklinks,
  getFolderTree,
  getGlobalGraph,
  getHubs,
  getLocalGraph,
  getOrphans,
  getStats,
  getSuggestedLinks,
  getTags,
  listNotes,
  searchNotes,
} from '../lib/queries'

/* ----------------------------------------------------------------- runner */

interface Check {
  name: string
  detail: string
  passed: boolean
  note?: string
}

const checks: Check[] = []
let failures = 0

async function check(
  name: string,
  detail: string,
  fn: () => Promise<{ ok: boolean; note?: string }>,
): Promise<void> {
  try {
    const { ok, note } = await fn()
    checks.push({ name, detail, passed: ok, note })
    if (!ok) failures++
  } catch (err) {
    const dbErr = toDbError(err)
    checks.push({
      name,
      detail,
      passed: false,
      note: `threw [${dbErr.code}] ${dbErr.message.split('\n')[0]}`,
    })
    failures++
  }
}

/* -------------------------------------------------- static source checks */

/**
 * The assignment requires parameterised Cypher with no string concatenation.
 * A plain grep for `${` is too blunt — it also flags error messages — so this
 * looks only at template literals that actually contain Cypher keywords.
 *
 * Worth automating rather than eyeballing: interpolating a value into a query
 * is a one-character mistake that nothing else in the pipeline would catch.
 */
async function checkNoInterpolatedCypher(): Promise<{ ok: boolean; note: string }> {
  const dir = path.join(process.cwd(), 'lib', 'queries')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'))

  const CYPHER_KEYWORD = /\b(MATCH|MERGE|CREATE|RETURN|UNWIND|DETACH DELETE|SET|WHERE)\b/
  const offenders: string[] = []

  for (const file of files) {
    const source = await readFile(path.join(dir, file), 'utf8')
    // Every backtick-delimited template literal in the file.
    for (const match of source.matchAll(/`([^`]*)`/g)) {
      const literal = match[1]
      if (!CYPHER_KEYWORD.test(literal)) continue
      if (!literal.includes('${')) continue
      const line = source.slice(0, match.index!).split('\n').length
      offenders.push(`${file}:${line}`)
    }
  }

  return {
    ok: offenders.length === 0,
    note:
      offenders.length === 0
        ? `${files.length} query files, every Cypher literal parameterised`
        : `interpolation inside Cypher at ${offenders.join(', ')}`,
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  console.log('Verifying query layer\n')
  await ping()

  // Anchor the checks on real, well-connected data rather than guessed slugs —
  // a query that works on a hub but not an arbitrary note is still broken.
  const hubs = await getHubs()
  if (hubs.length === 0) {
    console.error('No notes with links found. Run `npm run seed` first.')
    process.exit(1)
  }
  const subject = hubs[0].slug
  const notes = await listNotes()
  console.log(`Subject note: "${hubs[0].title}" (${subject})`)
  console.log(`Vault: ${notes.length} notes\n`)

  await check('1. backlinks', 'inbound links carry their context sentence', async () => {
    const rows = await getBacklinks(subject)
    const withContext = rows.filter((r) => r.context && r.context.trim().length > 0)
    return {
      ok: rows.length > 0 && withContext.length > 0,
      note: `${rows.length} backlinks, ${withContext.length} with context`,
    }
  })

  await check('2. local graph', 'MULTI-HOP — depth 2 reaches further than depth 1', async () => {
    const d1 = await getLocalGraph(subject, 1)
    const d2 = await getLocalGraph(subject, 2)
    // If depth 2 returns no more than depth 1, the variable-length traversal is
    // not actually traversing and the "2+ hops" requirement is unmet.
    return {
      ok: d1.nodes.length > 0 && d2.nodes.length > d1.nodes.length,
      note: `depth1=${d1.nodes.length} nodes/${d1.edges.length} edges → depth2=${d2.nodes.length} nodes/${d2.edges.length} edges`,
    }
  })

  await check('3a. cross-cluster bridge', 'path routes through a Person or Source', async () => {
    /*
     * The point of the heterogeneous model is that two notes in unrelated parts
     * of the vault can be connected through a shared author or book rather than
     * a direct link. Slugs are discovered rather than hardcoded: the seed vault
     * is generated, so naming a specific note here would test the fixture, not
     * the query. If AUTHORED_BY were dropped from the traversal these paths
     * disappear, which is the regression this guards.
     */
    const stoic = notes.filter((n) => n.folder?.startsWith('Philosophy'))
    const meta = notes.filter((n) => n.folder?.startsWith('Meta') || n.folder?.startsWith('Ideas'))
    if (stoic.length === 0 || meta.length === 0) {
      return { ok: false, note: 'expected Philosophy and Meta/Ideas notes in the vault' }
    }

    let best: { desc: string; via: string; distance: number } | null = null
    let checked = 0
    for (const a of stoic.slice(0, 12)) {
      for (const b of meta.slice(0, 12)) {
        checked++
        const path = await findPath(a.slug, b.slug)
        if (!path) continue
        const bridge = path.chain.find((s) => s.kind === 'Person' || s.kind === 'Source')
        if (!bridge) continue
        if (!best || path.distance > best.distance) {
          best = {
            desc: path.chain.map((s) => s.label).join(' → '),
            via: `${bridge.kind} "${bridge.label}"`,
            distance: path.distance,
          }
        }
      }
      if (best && best.distance >= 4) break
    }

    return {
      ok: best !== null,
      note: best
        ? `${best.distance} hops via ${best.via}: ${best.desc.slice(0, 150)}`
        : `no Person/Source-routed path among ${checked} cross-folder pairs`,
    }
  })

  await check('3b. shortest path', 'AWKWARD IN SQL — connects two distant notes', async () => {
    // Try the most distant pairs first: hubs from opposite ends of the ranking
    // are most likely to sit in different clusters.
    const candidates: [string, string][] = []
    for (let i = 0; i < Math.min(hubs.length, 6); i++) {
      for (let j = hubs.length - 1; j > hubs.length - 7 && j > i; j--) {
        candidates.push([hubs[i].slug, hubs[j].slug])
      }
    }

    let best: { distance: number; kinds: number; desc: string } | null = null
    for (const [from, to] of candidates) {
      const path = await findPath(from, to)
      if (!path) continue
      const kinds = new Set(path.chain.map((s) => s.kind)).size
      if (!best || kinds > best.kinds || (kinds === best.kinds && path.distance > best.distance)) {
        best = {
          distance: path.distance,
          kinds,
          desc: path.chain.map((s) => s.label).join(' → '),
        }
      }
    }

    return {
      // Two node types minimum: a path made only of Notes proves traversal but
      // not that the heterogeneous model earns its keep. The interesting paths
      // route through a Person or Source.
      ok: best !== null && best.distance >= 2 && best.kinds >= 2,
      note: best
        ? `${best.distance} hops across ${best.kinds} node types: ${best.desc.slice(0, 130)}`
        : 'no path found between any hub pair',
    }
  })

  await check('4. suggested links', 'unlinked notes sharing 2+ entities', async () => {
    // Not every note has suggestions; scan until one does before calling it broken.
    for (const hub of hubs.slice(0, 10)) {
      const rows = await getSuggestedLinks(hub.slug)
      if (rows.length > 0) {
        return {
          ok: rows.every((r) => r.strength >= 2 && r.via.length > 0),
          note: `"${hub.title}" → ${rows.length} suggestions, top shares ${rows[0].strength} via [${rows[0].via.slice(0, 3).join(', ')}]`,
        }
      }
    }
    return { ok: false, note: 'no suggestions for any of the top 10 hubs' }
  })

  await check('5. orphans', 'notes with no links in or out', async () => {
    const rows = await getOrphans()
    // Zero orphans is suspicious in a seeded vault — the seed was asked for some.
    return { ok: rows.length > 0, note: `${rows.length} orphan notes` }
  })

  await check('6. hubs', 'degree ranking is ordered and non-zero', async () => {
    const ordered = hubs.every(
      (h, i) => i === 0 || hubs[i - 1].inbound + hubs[i - 1].outbound >= h.inbound + h.outbound,
    )
    return {
      ok: hubs.length > 0 && ordered && hubs[0].inbound + hubs[0].outbound > 0,
      note: `top hub "${hubs[0].title}" has ${hubs[0].inbound} in / ${hubs[0].outbound} out`,
    }
  })

  await check('7. folder tree', 'recursive hierarchy with ancestry', async () => {
    const tree = await getFolderTree()
    const nested = tree.filter((f) => f.ancestry.length > 1)
    return {
      ok: tree.length > 0,
      note: `${tree.length} folders, ${nested.length} nested`,
    }
  })

  await check('8. search', 'finds notes by body text', async () => {
    // Search for a word drawn from real content so the term is guaranteed present.
    const term = hubs[0].title.split(/\s+/).find((w) => w.length > 4) ?? 'the'
    const rows = await searchNotes(term)
    return { ok: rows.length > 0, note: `"${term}" → ${rows.length} results` }
  })

  await check('9. global graph', 'whole vault renders as nodes and edges', async () => {
    const graph = await getGlobalGraph()
    const ids = new Set(graph.nodes.map((n) => n.id))
    // Every edge must point at a node we actually returned, or the force graph
    // silently drops links and the picture is wrong.
    const dangling = graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target))
    return {
      ok: graph.nodes.length > 0 && graph.edges.length > 0 && dangling.length === 0,
      note: `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${dangling.length} dangling`,
    }
  })

  await check(
    '10. no interpolation',
    'every Cypher literal is parameterised (§5.1)',
    checkNoInterpolatedCypher,
  )

  await check('supporting', 'tags and stats populate', async () => {
    const [tags, stats] = await Promise.all([getTags(), getStats()])
    return {
      ok: tags.length > 0 && stats.notes > 0 && stats.links > 0,
      note: `${tags.length} tags; ${stats.notes} notes, ${stats.links} links, ${stats.stubs} stubs`,
    }
  })

  /* ---------------------------------------------------------------- report */

  console.log('─'.repeat(78))
  for (const c of checks) {
    console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.name.padEnd(18)} ${c.detail}`)
    if (c.note) console.log(`      ${c.note}`)
  }
  console.log('─'.repeat(78))

  if (failures > 0) {
    console.error(`\n${failures} of ${checks.length} checks failed.`)
    process.exit(1)
  }
  console.log(`\nAll ${checks.length} checks passed.`)
}

main()
  .then(() => closeDriver())
  .catch(async (err) => {
    const dbErr = toDbError(err)
    console.error(`\nVerification failed [${dbErr.code}]: ${dbErr.message}`)
    await closeDriver()
    process.exit(1)
  })
