---
title: Vault Tooling — Overview
created: 2023-08-19
updated: 2025-05-30
tags: ["tools", "software", "note-taking"]
people: []
sources: []
---

Six scripts, about nine hundred lines total, that keep this vault from silently rotting. The design rule that matters more than any of the code: **nothing here writes to a note body.** Tools read markdown and write to an index. If a tool wants to change a note, it prints a suggestion and I decide.

## What each one does

- **parse** — walks the vault, extracts frontmatter and wikilinks. The only component that understands markdown, and it is fussier than it looks for reasons set out in [[Writing a Markdown Link Parser]].
- **index** — turns parse output into the link store, including the sentence around each link, which is the decision explained in [[Backlink Index Design]].
- **watch** — reruns the two above for changed files only. The dirty-set logic and what it costs in complexity is in [[Incremental Indexing]].
- **orphans** — reports notes nothing points at, with the caveats in [[Detecting Orphan Notes]].
- **suggest** — finds note pairs that share entities but no link, which is the highest-value report of the six and is described in [[Suggesting Links From Shared Entities]].
- **stats** — word counts and tag histograms. Mostly for reassurance.

## Why they are separate

I tried this as one program twice. Both times it became a program that could only be run in full, which meant it was slow, which meant I stopped running it, which meant the reports were stale, which meant I stopped trusting them. Six small things that each do one pass and write one artefact can be run in any order and debugged individually.

They are also disposable. If I rewrite the vault format next year I want to throw these away without regret, so none of them own state that is not reconstructible from the markdown in about forty seconds.
