/**
 * One-off repair: quote frontmatter list values in the seed vault.
 *
 * The authored files use YAML flow sequences like
 *
 *     sources: [Thinking in Systems: A Primer]
 *
 * Unquoted, YAML reads the colon as a mapping and the comma in
 * "Gödel, Escher, Bach" as a separator, so titles arrive as objects or get
 * shredded into fragments. Every affected title collapsed onto a single
 * "[object Object]" node, silently merging unrelated sources.
 *
 * Rather than teach the parser to guess, this rewrites the files to valid YAML
 * once, matching each line against the canonical titles from the vault
 * manifest so split titles are rejoined correctly.
 *
 *   npx tsx scripts/fix-frontmatter.ts
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const VAULT_DIR = path.join(process.cwd(), 'seed', 'vault')
const ENTITIES_FILE = path.join(process.cwd(), 'seed', 'entities.json')

type Field = 'sources' | 'people' | 'tags'

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = await Promise.all(
    entries.map(async (e) => {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) return findMarkdownFiles(full)
      return e.isFile() && e.name.endsWith('.md') ? [full] : []
    }),
  )
  return out.flat()
}

/**
 * Recover the intended entries from a flow-sequence body.
 *
 * Longest canonical names are tried first so "Peak: Secrets from the New
 * Science of Expertise, Deliberate Practice..." is not truncated by the
 * shorter "Peak: Secrets from the New Science of Expertise".
 */
function recover(inner: string, canonical: string[]): string[] {
  const found: { name: string; at: number }[] = []
  let remaining = inner

  for (const name of [...canonical].sort((a, b) => b.length - a.length)) {
    const at = remaining.indexOf(name)
    if (at !== -1) {
      found.push({ name, at })
      // Blank it out so a shorter title cannot match inside a longer one.
      remaining = remaining.slice(0, at) + ' '.repeat(name.length) + remaining.slice(at + name.length)
    }
  }

  if (found.length > 0) {
    return found.sort((a, b) => a.at - b.at).map((f) => f.name)
  }

  // Nothing canonical matched — fall back to a plain comma split.
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function main() {
  const entities = JSON.parse(await readFile(ENTITIES_FILE, 'utf8')) as {
    people?: { name: string }[]
    sources?: { title: string }[]
  }

  const canonical: Record<Field, string[]> = {
    sources: (entities.sources ?? []).map((s) => s.title),
    people: (entities.people ?? []).map((p) => p.name),
    tags: [],
  }

  const files = await findMarkdownFiles(VAULT_DIR)
  let changedFiles = 0
  let changedLines = 0
  const recovered = new Set<string>()

  for (const file of files) {
    const original = await readFile(file, 'utf8')
    const lines = original.split('\n')

    // Frontmatter only: between the first two `---` fences.
    if (lines[0]?.trim() !== '---') continue
    const closing = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (closing === -1) continue

    let touched = false

    for (let i = 1; i < closing; i++) {
      const match = lines[i].match(/^(\s*)(sources|people|tags):\s*\[(.*)\]\s*$/)
      if (!match) continue

      const [, indent, field, inner] = match
      if (inner.trim() === '') continue

      const values = recover(inner, canonical[field as Field])
      const rebuilt = `${indent}${field}: [${values.map(quote).join(', ')}]`

      if (rebuilt !== lines[i]) {
        if (/[:,]/.test(inner)) values.forEach((v) => recovered.add(`${field}: ${v}`))
        lines[i] = rebuilt
        touched = true
        changedLines++
      }
    }

    if (touched) {
      await writeFile(file, lines.join('\n'), 'utf8')
      changedFiles++
    }
  }

  console.log(`Quoted ${changedLines} frontmatter lines across ${changedFiles} files.`)
  const risky = [...recovered].filter((r) => /[:,]/.test(r.split(': ').slice(1).join(': ')))
  if (risky.length > 0) {
    console.log(`\nRejoined ${risky.length} titles that contained a colon or comma:`)
    for (const r of risky.sort()) console.log(`  ${r}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
