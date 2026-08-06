---
title: Goodhart's Law
created: 2023-06-25
updated: 2025-03-11
tags: ["systems", "epistemology"]
people: []
sources: []
---

When a measure becomes a target, it ceases to be a good measure. The original was about monetary aggregates; it turns out to be a general law about any proxy under pressure.

The mechanism is worth stating precisely, because "people game metrics" is only half of it. A metric correlates with the thing you care about across the range of behaviour that existed when you measured it. Making it a target moves behaviour outside that range — deliberately, that is the point of a target — and the correlation was never causal, so it does not survive the move. Gaming is one route. Honest, well-intentioned optimisation is another, and it is more common and harder to see.

The examples share one shape: response times measured, so tickets get closed and reopened; papers counted, so papers get smaller. Nobody has to be cynical.

Structurally it is a reinforcing loop around the proxy overwhelming the weak balancing loop that connected the proxy to the goal — see [[Balancing and Reinforcing Loops]].

What actually helps, in rough order:

- Keep the real goal explicitly stated next to the metric, and re-derive the metric periodically. Meadows puts goals near the top of the intervention ladder for exactly this reason — see [[Leverage Points]].
- Use several proxies that fail in different directions, so gaming one is visible in another.
- Do not automate consequences off a single number, because competence applied to a corrupted proxy only reaches the wrong destination faster — [[Optimising the Wrong Thing]].

Two deeper connections. Metrics only exist for things that have been made countable, and the act of making a system countable strips exactly the local knowledge that made it work — the argument in [[Legibility and Its Costs]]. And which effects the metric can even see depends on where you drew the edge, since [[System Boundaries Are Choices]] decides what counts as an externality.

Underneath it all is that no one optimises the true objective; they optimise a searchable representation of it, which is the constraint described in [[Bounded Rationality]].
