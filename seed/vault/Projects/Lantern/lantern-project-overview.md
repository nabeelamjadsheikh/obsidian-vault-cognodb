---
title: Lantern — Project Overview
created: 2024-09-14
updated: 2025-04-02
tags: ["projects", "software", "design"]
people: ["Andrew Mensah", "Keiko Tanaka"]
sources: []
---

Lantern is a reading companion. You highlight a passage, and instead of the highlight landing in a dead export file, it becomes a node that can be linked to other highlights, to the work it came from, and to the people arguing about it. That is the whole product. Everything else is scaffolding.

## Scope

The v1 surface is deliberately three screens: import, a highlight reader, and a link view. Anything that is not one of those three is out of scope until someone uses the first version for a month. The constraints that keep us honest are written up separately in [[Lantern — Design Principles]], and I refer back to them whenever a feature request sounds reasonable in isolation.

## Who does what

- Andrew Mensah owns storage and traversal. He pushed back hard on using a graph store at all, then changed his mind once he saw the query we actually needed; the shape he landed on is in [[Lantern — Data Model]].
- Keiko Tanaka runs interface critique. Her main contribution so far is refusing to let us ship an empty state, which forced the rethink recorded in [[Lantern — Onboarding Flow]].
- I do everything else, which mostly means writing things down so we stop having the same argument.

## Status

Import works for two sources. The reader is usable. The link view is a prototype that looks better than it is.

The decisions we have deferred are collected in [[Lantern — Open Questions]] rather than scattered through commit messages, because deferred decisions that live in commit messages get re-litigated every three weeks by whoever forgot.
