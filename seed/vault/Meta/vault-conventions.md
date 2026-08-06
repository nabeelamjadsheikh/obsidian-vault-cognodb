---
title: Vault Conventions
created: 2023-01-15
updated: 2025-05-30
tags: ["note-taking", "tools", "design"]
people: []
sources: []
---

Written down so that future me stops renegotiating them at eleven at night. Every one of these was a decision I made twice before writing it here.

## Naming

- Filenames are slugs: lowercase, hyphenated, no dates except in `Daily/`.
- Titles are claims where possible. "Interleaving Beats Blocking" beats "Interleaving". A title that is a noun phrase is a warning sign that the note has no argument.
- Titles are stable. Renaming breaks links, and the link text is the thing readers see.

## Folders

Three levels maximum, and folders are a coarse neighbourhood only — never the retrieval mechanism. The reasoning is [[Links Over Folders]]. If I am agonising over which folder something goes in, the answer is that it does not matter and I should stop.

## Tags

A closed vocabulary, currently about twenty-five terms. New tags require deleting an old one or a genuine argument. Tags filter, links argue; the full distinction is [[Tags Versus Links]].

## Frontmatter

`title`, `created`, `updated`, `tags`, `people`, `sources`. People and sources by exact canonical name — inconsistency here silently fragments the graph, and the link-suggestion features depend on entity identity.

## Links

Every link sits inside a sentence that says why the two notes are related. No bare "see also" lists. This is a hard rule because the sentence is stored and displayed in the backlinks panel; a link without one is a dead relationship.

## Maintenance

Weekly, twenty minutes, per [[The Weekly Note Hygiene Review]]. Split decisions follow [[When to Split a Note]]. Entry points are hand-maintained per [[Maps of Content]] and are the only structure I will spend real time on.

Amendments go at the bottom with a date, so I can see how often I have relitigated something.
