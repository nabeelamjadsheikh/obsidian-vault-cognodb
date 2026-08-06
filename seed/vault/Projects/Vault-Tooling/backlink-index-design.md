---
title: Backlink Index Design
created: 2023-09-18
updated: 2025-05-29
tags: ["software", "tools", "note-taking"]
people: []
sources: []
---

A backlink panel that lists filenames is a worse table of contents. A backlink panel that shows, for each incoming link, the sentence it appeared in is a document — you can read down it and reconstruct why fourteen notes point here without opening any of them.

That single decision — store the context on the edge, not just the endpoints — is the reason this vault feels navigable, and it costs almost nothing. The index record is source, target, context, position. Four fields.

## What it changes downstream

Once context lives on the edge, several things that were hard become easy:

- Backlinks become skimmable, so I actually read them, so stale links get noticed.
- A link whose only context is the words "see also" is visibly worthless in the panel, which shames me into writing a real sentence. The tooling improved my writing simply by displaying it.
- Orphan reporting can distinguish a note nobody references from a note referenced only in passing, which is the nuance that makes [[Detecting Orphan Notes]] more than a degree-zero query.
- Suggestions can show why a pair was proposed, which is the difference between a useful and an ignorable report in [[Suggesting Links From Shared Entities]].

## Cost

The index is roughly three times larger than a plain adjacency list, and it invalidates on any body edit rather than only on link changes, which is the whole reason [[Incremental Indexing]] needed a dirty-set rather than a link-hash comparison. Both prices are worth paying.

The index is a derived artefact — deletable, rebuildable in one pass, owned by nothing else, per the rule in [[Vault Tooling — Overview]]. I rebuild from scratch about once a month just to prove that I still can.
