---
title: Ranking Search Results in a Vault
created: 2024-03-11
updated: 2025-05-31
tags: ["software", "tools"]
people: []
sources: []
---

I assumed personal search was a text relevance problem and spent a weekend tuning BM25 parameters. The results were fine and the ranking was still wrong, and it took a while to see why.

## The insight

When I search my own vault I am almost never *discovering*. I am *returning*. I know the note exists, I half-remember what it is called, and I want it in the first two results. That is a completely different problem from web search, where the ranker's job is to find things you have never seen.

For returning, two signals dominate:

- **Recency of update.** The note I want is overwhelmingly likely to be one I touched in the last fortnight.
- **Inbound link count.** Notes the rest of the vault points at are the notes I think with, so they are the ones I look for.

A weighted combination of those two, with text match used mainly as a filter rather than a score, beat pure relevance in every informal test I ran on myself. Which surprised me, and probably should not have — it is the same inverse-frequency intuition that makes [[Suggesting Links From Shared Entities]] work.

## Details that mattered

Title matches get a large multiplier; a query is usually a half-remembered title. Matches inside a link's context sentence score higher than matches in ordinary body text, because that sentence was written to describe a connection and is therefore unusually dense — an unexpected dividend of [[Backlink Index Design]].

Stubs are demoted hard. A stub matching your query exactly is still not what you wanted.

Ranking is only usable if the index is current within a keystroke or two, which is the entire justification for [[Incremental Indexing]]. And the ranked-list-beats-diagram conclusion in [[Graph Layout Experiments]] uses this same scoring function to order neighbours.
