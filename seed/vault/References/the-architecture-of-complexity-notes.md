---
title: Notes on The Architecture of Complexity
created: 2023-11-05
updated: 2025-03-01
tags: ["systems", "complexity", "reading"]
people: ["Herbert Simon"]
sources: ["The Architecture of Complexity"]
---

Twenty-odd pages from 1962, and still the cleanest argument for modularity ever written.

The parable does the work. Two watchmakers, Hora and Tempus, build watches of a thousand parts. Tempus builds each watch as one unbroken assembly, so any interruption collapses the whole thing back to nothing. Hora builds stable sub-assemblies of ten, then assembles those into larger units of ten. Both are interrupted at the same rate; Hora finishes, Tempus goes out of business. Simon's conclusion is that complex systems we observe are overwhelmingly hierarchic because hierarchic ones are the only ones that had time to evolve.

The second half is the part people skip and the part I care about. A hierarchy is *near*-decomposable: interactions inside a subsystem are strong and fast, interactions between subsystems are weak and slow. That means short-run behaviour of a component is roughly independent of the others, and long-run behaviour depends only on their aggregates. This is the licence to reason about one module at a time, and everything I wrote about [[Hierarchy and Near-Decomposability]] is downstream of those pages.

> The fact that many complex systems have a nearly decomposable, hierarchic structure is a major facilitating factor enabling us to understand, describe, and even "see" such systems and their parts.

Three connections I keep making:

- Near-decomposability is what makes finite minds adequate to large systems, so it is the structural counterpart of [[Bounded Rationality]] rather than a separate idea.
- His treatment of hierarchy as a redescription problem — the same system, different levels, different vocabularies — is a deflationary account of [[Emergence]], and healthier than the mystical versions.
- Because you stop at a sub-assembly that is merely good enough to be stable, evolution is a [[Satisficing]] process, not an optimising one.
