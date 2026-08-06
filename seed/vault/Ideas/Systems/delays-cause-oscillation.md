---
title: Delays Cause Oscillation
created: 2023-05-09
updated: 2024-11-05
tags: ["systems", "feedback-loops"]
people: []
sources: ["Thinking in Systems: A Primer"]
---

Take a balancing loop, the most stable structure there is, and insert a delay between the action and the signal. It stops stabilising and starts swinging. No malice, no incompetence, no bad actors required — the delay alone is sufficient.

The shower is the standard demonstration and it is exact. Water is too cold, you turn the tap, nothing happens because the pipe is long, you turn it further, and thirty seconds later you are scalded. Then you overcorrect the other way. The oscillation is caused entirely by acting on information about a state that no longer exists.

Real instances I have watched:

- Hiring. Backlog grows, hiring starts, six months of pipeline later the new people arrive just as the backlog clears, so you are overstaffed, so you freeze, so the backlog grows.
- Inventory in any supply chain, amplified at each stage — the beer game result, where perfectly sensible local decisions produce wild swings upstream.
- Any team that adjusts strategy quarterly on metrics that take two quarters to respond.

The lesson that is hard to accept: with a long delay, the correct response is to **act less aggressively**, not more. Aggressive correction in a delayed loop guarantees overshoot. Patience is the technically right answer, and it looks like negligence to everyone watching.

The two structural fixes are shortening the delay or damping the response, and delay length is one of the more powerful and less used interventions on the list in [[Leverage Points]].

Mechanically this is just a delayed instance of the goal-seeking structure in [[Balancing and Reinforcing Loops]], and it is why [[Feedback Loops]] must always be drawn with their timing attached.

There is a design consequence too: buffers absorb swings, which is one of the reasons stripping slack out of a system makes it fragile — see [[Resilience Versus Efficiency]].
