---
title: Lantern — Data Model
created: 2024-10-02
updated: 2025-05-29
tags: ["software", "projects", "design"]
people: ["Andrew Mensah"]
sources: []
---

Four node kinds: Highlight, Work, Person, Theme. Everything else that looked like an entity in the first sketch turned out to be a relationship wearing a costume.

## The join table that became an edge

The original relational sketch had a `highlight_themes` table with a `confidence` column and a `created_at`. Andrew Mensah's argument, which took me embarrassingly long to accept, was that we never queried that table for its own sake — every single query joined through it to get somewhere else. That is the definition of an edge with properties, and modelling it as a table meant paying a join to express something the storage layer could hold natively.

The same reasoning applies to attribution. A Work is not authored by a string; it is connected to a Person, and that Person can be the author of one work and the subject of a highlight in another. Collapsing that to a text column would have thrown away the only interesting query we have.

## What we store on the edge

The connective tissue between two highlights carries the sentence the user wrote when they made the link. This is the single decision I would defend hardest, and it is the same bet as [[Backlink Index Design]] in the vault tooling: a bare list of connected items is unreadable, and a list of connected items each annotated with why is a document you can actually skim.

The traversals this shape enables — and the reason it is not over-general — are written up in [[Lantern — Query Patterns]]. The scope this model is meant to serve is in [[Lantern — Project Overview]].

Two things are still unresolved: whether Theme is a node or a tag, and whether a Highlight can belong to two Works. Both are parked in [[Lantern — Open Questions]] until we have real data to argue over.
