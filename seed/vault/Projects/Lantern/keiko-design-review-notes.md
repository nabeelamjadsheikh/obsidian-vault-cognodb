---
title: Design Review with Keiko
created: 2024-11-12
updated: 2025-03-07
tags: ["design", "projects"]
people: ["Keiko Tanaka"]
sources: []
---

Notes from ninety minutes with Keiko Tanaka on the first onboarding pass. I have rewritten these twice because my first version recorded my defences rather than her points.

## The main critique

Almost every problem she found was copy doing work the interface should have done. The tour card that said "Lantern finds connections between your highlights" existed because the screen behind it showed nothing that would let you infer that. Her formulation: *if you have to explain the mechanism, you have not shown the mechanism.* Delete the sentence, then fix whatever the sentence was covering for.

She counted seven places where we explain rather than demonstrate. Five of them collapsed into a single fix — show a real suggested link on the fourth imported highlight — which is now the spine of [[Lantern — Onboarding Flow]].

## Smaller things

- The import button says "Import"; it should say what will happen after.
- Two different greys for two different meanings of disabled.
- The annotation prompt appears after the link is made, so people write nothing. Move it into the same gesture.
- Empty search results currently apologise. They should offer.

## The framing that stuck

Late in the call she stopped listing problems and restated onboarding as a pattern: a new user has no material to work with, and the app needs material to be useful, and those two forces are in direct conflict. Stated that way the fix is obvious — manufacture the material — and the argument we had been having for a month simply ended. That move is why the pattern format ended up in [[Lantern — Design Principles]].

Most of this feeds back into scope decisions logged in [[Lantern — Project Overview]], and I owe her a written response on two of the smaller items.
