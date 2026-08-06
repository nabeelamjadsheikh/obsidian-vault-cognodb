---
title: Andrew on Graph Databases
created: 2024-04-11
updated: 2025-06-09
tags: ["software", "projects", "tools"]
people: ["Andrew Mensah"]
sources: []
---

Three hours in a pub with Andrew, who spent a decade being loudly sceptical of graph databases and now works on one. Written up the next morning while I still had the thread.

His core claim: a graph store earns its keep when the *queries* are recursive, not when the *data* looks like a graph. Almost everything looks like a graph if you squint. Social follows, product catalogues, org charts — all of it models fine in Postgres, and a join on an indexed foreign key is very fast. The moment it flips is when the depth of traversal is unknown at query time. Two joins is fine. "Everything reachable within four hops, ranked by path length" is where recursive CTEs stop being readable and start being slow.

That maps directly onto what we need in [[Lantern — Query Patterns]], where the interesting questions are all of that shape: neighbourhoods, shortest paths between two notes, notes that share entities but no direct link.

His second point was about the shape of the write path. He argued that backlinks are not derived data in a graph store — the edge *is* the backlink, traversed in the other direction — so a whole category of denormalised index-maintenance code just evaporates. That is worth re-reading against [[Backlink Index Design]], because we currently maintain more than we need to.

Where he pushed back on us:

- Property graphs are bad at large aggregations. Do not put analytics in the same store.
- Modelling discipline matters more than in SQL, because nothing stops you inventing a new relationship type at 2 a.m. He was blunt that [[Lantern — Data Model]] should freeze the label and relationship vocabulary before we write another query.
- "You will regret every property you store on a relationship that you cannot index." Noted, and taken into [[Vault Tooling — Overview]].
