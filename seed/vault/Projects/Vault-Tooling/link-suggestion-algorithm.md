---
title: Suggesting Links From Shared Entities
created: 2023-11-02
updated: 2025-05-28
tags: ["software", "tools", "note-taking"]
people: []
sources: []
---

The best report the tooling produces, by a wide margin. Find pairs of notes that share several tags, people or sources, and that have no link between them in either direction. Rank by how much they share. Show me the top twenty.

The premise is simple: if two notes cite the same book and mention the same person and carry two of the same tags, and neither points at the other, then either I wrote the same thought twice or I have failed to notice a connection I already half-made. Both are worth five seconds of my attention.

## Weighting

Not all shared entities are equal, and the first version was useless because it treated them as if they were.

- A shared **source** is strong evidence. Two notes citing the same paper are usually about the same thing.
- A shared **person** is moderate.
- A shared **tag** is weak on its own — `software` connects nothing — but strong in combination.

I ended up weighting by inverse frequency: sharing a rare tag counts for much more than sharing a common one. This is ordinary TF-IDF logic and I should have started there. It is also the same weighting instinct behind the scoring in [[Ranking Search Results in a Vault]].

## What it caught

The two best catches were a note on satisficing and a note on project scope that shared a source and had circled each other for a year, and a pair on interleaving that should have been one note. That second case is a signal the report gives for free: if two notes score very high, sometimes the answer is not a link but a merge.

Suggestions do not write anything — they print, per the rule in [[Vault Tooling — Overview]]. Showing the shared entities alongside the pair is what makes the report actionable, which is the same argument as [[Backlink Index Design]].

This is also the practical answer to [[Tags Versus Links]]: tags are not a weaker link, they are the raw material from which links get proposed. And it is the first thing I run against anything flagged by [[Detecting Orphan Notes]].
