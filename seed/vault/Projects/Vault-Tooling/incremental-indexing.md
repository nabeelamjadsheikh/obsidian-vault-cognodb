---
title: Incremental Indexing
created: 2024-02-08
updated: 2025-03-26
tags: ["software", "tools"]
people: []
sources: []
---

Full reindex on every save is the right default and I defended it for a long time. Two hundred notes rebuilt in about 200ms; there is no problem here. At roughly seven hundred notes with the context extraction from [[Backlink Index Design]] doing real work, it crossed 1.4 seconds, and 1.4 seconds on save is exactly the kind of latency that makes you stop saving.

## The dirty set

Watch the filesystem, collect changed paths, reparse only those, then patch the index. Conceptually trivial. The complexity is entirely in the patch step.

The trap: editing note A changes A's *outbound* edges, which changes B's *inbound* edges. So the invalidation set is not the changed file, it is the changed file plus every note it linked to before the edit plus every note it links to after. You need the previous parse result to compute that, which means the index has to store enough to reconstruct the old edge list, which means the index now has state that can diverge from the files.

And it does diverge. Renames, external edits, git checkouts, and a nasty one where an editor writes a temp file and renames over it, producing a delete-then-create that the watcher reports out of order.

## What I actually shipped

- Dirty-set incremental on the normal path, typically under 30ms.
- A full rebuild every time the process starts, no exceptions.
- A `--verify` mode that rebuilds into a scratch index and diffs against the live one. I run it weekly. It has caught real drift twice.

That third item is the honest cost: incremental indexing means owning a consistency checker forever. Worth it here, and it would not have been worth it at two hundred notes. Parsing is the expensive half and its cost is explained in [[Writing a Markdown Link Parser]]; the freshness this buys is what makes the ranking in [[Ranking Search Results in a Vault]] usable while typing. The `watch` script is one of the six in [[Vault Tooling — Overview]].
