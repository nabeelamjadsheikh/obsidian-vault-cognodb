---
title: Detecting Orphan Notes
created: 2023-10-07
updated: 2025-04-28
tags: ["software", "note-taking"]
people: []
sources: []
---

The naive query is inbound degree zero. It returned sixty-one notes, of which about eight were actually problems, and a report that is eighty-five percent noise is a report nobody opens twice.

## The categories that need different treatment

**Stubs.** A note I created as a link target and have not written yet. It has no inbound links *and* almost no body. This is not an orphan, it is a debt, and it belongs on a different list with a different urgency.

**Index notes.** A map of content points at thirty things and is pointed at by two. Low inbound degree is its normal condition. Flagging it every week trains me to ignore the report.

**Daily notes.** Journal entries are legitimately terminal. Nothing should link back to a Tuesday. Excluded by folder.

**Genuine orphans.** A substantial note, not a stub, not an index, not dated, that nothing references. These are the ones worth surfacing — usually a good idea I wrote once and then failed to connect to anything, which means I will never find it again.

## The heuristic I settled on

Inbound degree zero, AND word count above a threshold, AND outbound degree below five, AND not in a dated folder. Four conditions, all cheap, and the report dropped from sixty-one to nine. Every one of the nine was worth acting on.

The right response to a flagged orphan is usually not to invent a link but to run [[Suggesting Links From Shared Entities]] against it and see whether the vault already knows where it belongs. The distinction between a note nobody links and a note linked only in passing depends on the context sentences described in [[Backlink Index Design]].

This runs weekly as part of [[The Weekly Note Hygiene Review]], and the script itself is one of the six described in [[Vault Tooling — Overview]].
