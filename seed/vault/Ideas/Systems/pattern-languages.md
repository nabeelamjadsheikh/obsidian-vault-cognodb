---
title: Pattern Languages
created: 2023-11-20
updated: 2025-02-05
tags: ["design", "systems", "craft"]
people: ["Christopher Alexander"]
sources: ["A Pattern Language", "Notes on the Synthesis of Form"]
---

A pattern, in Alexander's sense, has a strict form and it is not a template. It names a **recurring conflict of forces** in a context, and a resolution that lets those forces settle. Light On Two Sides Of Every Room: the conflict is between wanting light and wanting enclosure, and the resolution is that rooms lit from one side produce glare and faces you cannot read, so people do not stay in them.

Three properties make the form work:

- **It names forces, not solutions.** This is why patterns transfer. You can judge whether your situation has the same conflict, and if it does not, you skip it. Copying a solution without its forces is cargo cult design.
- **It is at the scale a person can act on.** Not a master plan; a decision one builder can make on a Tuesday.
- **Patterns compose into a language.** Larger patterns are completed by smaller ones, so a sequence of local decisions produces a coherent whole nobody drew.

That last property is the reason I keep returning to this. A pattern language is a solution to a genuinely hard problem: how do many hands, working independently at different scales and times, build one thing that hangs together? The answer is shared local rules rather than central specification — which makes it the most concrete design methodology I know for producing [[Emergence]] deliberately rather than hoping for it.

My working notes on the big book are in [[Notes on A Pattern Language]], and the thing all the patterns are supposedly in service of is the property Alexander refuses to name, discussed in [[The Quality Without a Name]].

The software adaptation lost most of this. It kept the catalogue and dropped the forces, which is why design patterns became a vocabulary rather than a method.
