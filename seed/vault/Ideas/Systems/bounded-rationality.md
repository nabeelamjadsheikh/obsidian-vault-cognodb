---
title: Bounded Rationality
created: 2023-12-08
updated: 2025-04-30
tags: ["systems", "epistemology", "mental-models"]
people: ["Herbert Simon"]
sources: ["The Sciences of the Artificial"]
---

The economic model of a decision-maker computes the optimum over all options. Simon's objection is not that people are irrational but that this model is not even wrong about the constraint: no agent, human or machine, has the attention, information or time to enumerate the alternatives. Rationality is bounded by the cost of thinking.

The consequence is the interesting part. If you cannot evaluate all options, your behaviour is determined by your **search procedure** — where you look, in what order, and when you stop. Two people with identical preferences and identical information will choose differently because they searched differently. So to predict behaviour you should study the search, not the utility function. That is a completely different research programme, and Simon's whole career follows from it.

His famous image: an ant's path across a beach is complicated, but the ant is simple. The complexity is in the terrain. Much apparent sophistication in human decision-making is the shape of the environment, not the shape of the mind.

The stopping rule that makes bounded search work is the subject of [[Satisficing]] — take the first option above a threshold — and it is a genuinely optimal policy once search has a price.

What makes any of this survivable is that the world is chunky enough to permit local models: you can reason about one subsystem while ignoring the rest and be approximately right, which is Simon's other great result in [[Hierarchy and Near-Decomposability]] and which I keep coming back to in [[Notes on The Architecture of Complexity]].

There is a dark corollary. Because we optimise over a searchable representation rather than the actual objective, any proxy we adopt becomes the thing pursued — the mechanism underneath [[Goodhart's Law]]. Bounded rationality is not merely a limitation; it is the reason metrics take over.

The compression that makes bounded agents effective is a small library of models with high predictive yield, which is the case in [[Mental Models Are Compression]].
