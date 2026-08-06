---
title: Graph Layout Experiments
created: 2024-01-16
updated: 2025-03-27
tags: ["software", "design", "tools"]
people: []
sources: []
---

I have now built the force-directed vault graph three times and thrown it away three times. Writing this down mostly so I stop.

## The problem

Force-directed layout is genuinely beautiful at fifty nodes. At three hundred it becomes a hairball with a bright centre, and — this is the part that took me too long to accept — the position of a node carries no information a reader can act on. Two notes near each other might be strongly connected, or might have been pushed there by unrelated repulsion from a dense cluster. You cannot tell by looking, so you cannot conclude anything by looking.

The screenshot is impressive. The tool is useless. Those facts coexist comfortably, which is why the experiment keeps recurring.

## What worked instead

- **Local neighbourhood, two hops, capped at forty nodes.** Bounded, laid out radially from the focus note. Position now means distance from the thing you are looking at, which is a fact.
- **A ranked list.** For "what is near this note", a list beats a picture almost always, ordered by the same weighting used in [[Ranking Search Results in a Vault]].
- **Cluster colouring by folder.** Only useful as a diagnostic — if a folder does not form a visible cluster, it is probably not a real category.

## The one thing the global view is good for

Spotting structure I did not intend. The global graph is how I noticed that the writing and creativity clusters had almost no edges between them, which was wrong and led directly to a batch of new links proposed by [[Suggesting Links From Shared Entities]]. So it is a diagnostic instrument, not a navigation surface, and it should be run occasionally rather than rendered on the home screen.

Both views read the same derived store described in [[Backlink Index Design]], and the renderer is deliberately not one of the six scripts in [[Vault Tooling — Overview]] — it is a toy, and it should stay separable from the things I rely on.
