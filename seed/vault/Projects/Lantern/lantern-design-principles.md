---
title: Lantern — Design Principles
created: 2024-09-21
updated: 2025-03-06
tags: ["design", "projects", "craft"]
people: ["Christopher Alexander"]
sources: ["The Timeless Way of Building"]
---

Five rules, written as patterns rather than commandments, because a rule without its conflicting forces is just a preference with good posture. The format is stolen wholesale from Christopher Alexander — each one names a tension, then resolves it. That framing is why [[The Quality Without a Name]] keeps coming up in our reviews: we can tell when a screen has it and we cannot say why, which is exactly the problem Alexander was writing about.

> The specific patterns out of which a building or a town is made may be alive or dead. To the extent they are alive, they let our inner forces loose, and set us free.

1. **Highlights are not quotes.** A highlight carries where it sat in the argument. The force against this is import speed; the resolution is that we accept slower import.
2. **A link must be cheap to make and expensive to lose.** One keystroke to create, a confirmation to delete. The asymmetry is intentional.
3. **No empty states.** If we cannot show something useful, we have not earned the screen. This is the principle that drove the rewrite in [[Lantern — Onboarding Flow]].
4. **The graph is a reading aid, not a picture.** A layout is only worth rendering if it answers a question the user actually asked, which is the constraint the shape in [[Lantern — Data Model]] was built to satisfy.
5. **Never lose the user's words.** Import is additive. Nothing we compute overwrites something a human typed.

These five are the reason the feature list in [[Lantern — Project Overview]] is as short as it is. Most requests fail rule 3 or rule 5, and failing either is disqualifying rather than a trade-off to be discussed.
