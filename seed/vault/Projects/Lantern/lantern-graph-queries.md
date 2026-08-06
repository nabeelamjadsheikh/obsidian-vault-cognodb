---
title: Lantern — Query Patterns
created: 2024-10-11
updated: 2025-06-01
tags: ["software", "projects"]
people: ["Andrew Mensah"]
sources: []
---

The app needs exactly four traversals. I keep this list short on purpose, because every query we add is a query someone has to keep fast.

## The four

1. **Backlinks for a highlight.** One hop inbound, returning the annotation stored on the edge. Cheap, and the most-used screen in the product.
2. **Shared-theme neighbours.** Two hops out through Theme and back, excluding the origin and anything already directly linked. This is the same idea as [[Suggesting Links From Shared Entities]], applied to highlights instead of notes, and it is the feature that makes the app feel like it knows something.
3. **Work-to-work through people.** Highlight to Work to Person and back down. Answers "what else has this argument's author been arguing".
4. **Bounded neighbourhood for the link view.** Variable-length, ceiling of three, filtered by path length afterwards.

## Why every one is parameterised

Andrew Mensah's rule, and he is right: the query text is a constant in the source file and the values arrive separately. Not because a user id is going to contain a semicolon, but because a query built by concatenation cannot be cached by the planner, cannot be logged usefully, and cannot be reviewed by reading the file. The habit costs nothing and the alternative fails in ways that are invisible until they are catastrophic. The longer version of this argument, including his conversion story on graph stores generally, is in [[Andrew on Graph Databases]].

Traversal 4 has a wrinkle: the depth ceiling has to be a literal in the pattern, so the user-supplied depth becomes a filter on path length rather than part of the pattern itself. It reads slightly awkwardly and it is correct.

The node shapes these run over are defined in [[Lantern — Data Model]]. Result ordering borrows the recency-plus-degree weighting I worked out in [[Ranking Search Results in a Vault]].
