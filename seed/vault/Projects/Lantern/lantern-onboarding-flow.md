---
title: Lantern — Onboarding Flow
created: 2024-11-05
updated: 2025-03-08
tags: ["design", "projects"]
people: ["Keiko Tanaka"]
sources: []
---

Target: from first launch to the user's first genuinely useful link in under two minutes, with no screen that says "nothing here yet".

## The flow

- [x] Launch drops you straight into an import picker, not a welcome screen.
- [x] Import runs in the background; the reader opens on the first highlight the moment it exists.
- [x] After the fourth highlight is parsed, a suggested connection appears inline in the reader.
- [ ] Accepting a suggestion writes the annotation prompt in the same keystroke. Still two steps.
- [ ] Failure path when the import file is unreadable. Currently a toast, which is not good enough.

The suggestion at step three is doing all the work. It is the moment the app stops being a highlight list and becomes the thing described in [[Lantern — Project Overview]], and if it fires late or fires on a bad pair, the user never sees the point.

## Why there is no tour

The first pass had a three-card tour. Keiko Tanaka's critique of it, recorded properly in [[Design Review with Keiko]], was that every card was copy explaining something the interface should have demonstrated. She was right in a way that was annoying to hear: the tour existed because the empty state was unbearable, and the correct fix was to remove the empty state, not to decorate it. That is now rule three in [[Lantern — Design Principles]].

The unresolved bit is what happens for a user with a very small library — four highlights total, no plausible suggestion. We currently show a slightly sad reader. That case is logged in [[Lantern — Open Questions]] and I suspect the answer is that we seed one suggestion against a public domain sample, which several people will hate.
