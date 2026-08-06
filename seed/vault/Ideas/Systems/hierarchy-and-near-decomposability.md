---
title: Hierarchy and Near-Decomposability
created: 2023-10-14T00:00:00.000Z
updated: 2025-05-13T00:00:00.000Z
tags:
  - systems
  - complexity
people:
  - Herbert Simon
sources:
  - The Architecture of Complexity
---

Simon's parable of the two watchmakers is the most useful thing I know about why anything complex exists at all.

Hora and Tempus both make watches of a thousand parts. Tempus builds each watch as one sequence — put it down before it is finished and it falls apart, and he must start over. Hora builds stable subassemblies of ten, then assemblies of ten subassemblies, then the watch. Both are interrupted at the same rate by customers calling. Hora prospers; Tempus goes out of business, and the ratio is not close — it is thousands to one.

The conclusion: complex systems that exist are almost always hierarchic, not because hierarchy is elegant but because hierarchic forms are the ones that can be reached by an evolutionary process. Anything else has to be assembled in one go, and nothing large gets assembled in one go.

The second half of the paper is the part I use more. Near-decomposability: in such systems, interactions *within* a subsystem are much stronger and faster than interactions *between* subsystems. So in the short run each part behaves as if the others did not exist, and in the long run only the aggregate behaviour of the parts matters. That is what makes a complex system analysable at all — you can study one level while treating the rest as constant, and be approximately right.

This is the substrate that makes [[More Is Different]] possible: levels exist because coupling is uneven, and stable intermediate forms are what new laws can appear at. My longer working notes are in Notes on The Architecture of Complexity.

Two consequences. Deciding where one subsystem ends is a modelling decision with real costs, which is the point of [[System Boundaries Are Choices]]. And the reason humans can manage complex systems at all is that near-decomposability makes a local, partial model good enough — the enabling condition for [[Bounded Rationality]].
