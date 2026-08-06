---
title: Resilience Versus Efficiency
created: 2024-05-20
updated: 2025-01-21
tags: ["systems", "complexity", "design"]
people: ["Donella Meadows"]
sources: ["Thinking in Systems: A Primer"]
---

Resilience is the ability to recover from a shock and keep functioning. Efficiency is the ratio of output to input. They trade against each other, and the trade is almost always resolved in favour of efficiency, because efficiency is measurable this quarter and resilience is only measurable in the counterfactual.

Meadows' point is that resilience lives in redundancy, buffers, slack and diversity — every one of which shows up on an audit as waste. Three suppliers where one would do. Inventory sitting still. An engineer with no assigned project. Someone will find each of these, and eliminating them will be correct on every metric available at the time.

Then the shock arrives and the system has no give.

The trap is structural, not moral. Efficiency gains are visible, attributable and immediate; resilience losses are invisible until they are catastrophic and by then unattributable. It is an information problem before it is a values problem.

Two things buffers actually do, which is why cutting them hurts twice:

- They absorb variability, so a shock does not propagate.
- They **damp oscillation**, because they decouple upstream from downstream timing. Remove them and you get exactly the swinging described in [[Delays Cause Oscillation]] — a lean supply chain is a delayed loop with nothing to absorb the overshoot.

The intervention framing: buffer sizes and system slack sit in the middle of the list in [[Leverage Points]], which is to say more powerful than parameters and much less popular.

The decision-theoretic version of the same point is that maximising is dangerous and thresholds are safe — [[Satisficing]] on a resource level, rather than minimising it, is what keeps the give in a system. Aim for good enough utilisation, not maximum.
