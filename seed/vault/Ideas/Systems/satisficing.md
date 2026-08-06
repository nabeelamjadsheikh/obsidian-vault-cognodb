---
title: Satisficing
created: 2024-02-04
updated: 2024-12-27
tags: ["systems", "design", "mental-models"]
people: ["Herbert Simon"]
sources: ["The Sciences of the Artificial"]
---

Simon's coinage, from satisfy plus suffice: set a threshold of acceptability and take the first option that clears it. Stop searching. Do not look at the rest.

The standard reading is that this is a concession — the poor man's optimisation, what you do when you cannot afford the real thing. That reading is wrong, and the correction matters. Once search has a cost, satisficing **is** the optimal policy for most decisions, because the expected gain from continuing to look is smaller than the cost of looking. The optimiser who evaluates every apartment in the city has not made a better decision; they have made a slightly better choice at enormous expense and probably lost the apartment.

Where it earns its keep is in the aspiration level, which is the only real parameter. Set it too high and you search forever. Set it too low and you take garbage. And in practice the level adapts — after a run of bad options, standards fall, which is a balancing loop most people do not know they are running.

This is the operational half of [[Bounded Rationality]]: the theory says search is limited, satisficing is the stopping rule that makes limited search work.

Two applications I use constantly. In design, most decisions are threshold decisions and treating them as optimisation problems consumes the time that the two decisions that matter deserved. And in any system with a metric, note that satisficing on a proxy is much safer than maximising it — maximisation is what pushes behaviour out of the range where the proxy correlated with the goal, which is the whole mechanism of [[Goodhart's Law]].

The failure case is satisficing on the wrong criterion, where a low bar on a badly chosen objective gets cleared instantly and confidently — see [[Optimising the Wrong Thing]].
