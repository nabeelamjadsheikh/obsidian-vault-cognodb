---
title: Writing a Markdown Link Parser
created: 2023-09-04
updated: 2024-12-14
tags: ["software", "tools"]
people: []
sources: []
---

The regex is four characters of bracket and a lazy capture, and it is wrong within about twenty notes.

## Everything that breaks it

**Code fences.** A note about wikilink syntax contains wikilinks that are examples, not links. If the parser does not track fence state it will happily create an edge to a note called `Exact Note Title`. This alone forces you from a regex to a line-wise state machine.

**Inline code.** Same problem, harder, because backticks can be unbalanced within a line and the fence rule does not apply.

**Aliases.** A wikilink with a pipe in it links to one note and displays another string. The target is the left side; the extracted context sentence should keep the right side, because that is what a reader actually saw.

**Headings and blocks.** A wikilink with a trailing hash and heading name targets a note, not a section-of-a-note, unless you want section nodes, which I emphatically do not.

**Escapes.** Backslash-escaped brackets appear in exactly two of my notes, and both are notes about this parser.

## The context sentence

Extraction is the part I have rewritten most. Naively you take the surrounding sentence by splitting on periods, and then abbreviations, decimals and ellipses ruin your day. What I settled on: expand outward from the link to the nearest sentence-ish boundary, cap at 240 characters, and never cross a line break or a list-item boundary. It is approximate and it is good enough, because the consumer is a human reading a panel, not a machine. Why that sentence matters at all is argued in [[Backlink Index Design]].

Output is a flat list of link records, which is all [[Vault Tooling — Overview]] promises anyone. The dirty-file logic that decides when to rerun this lives in [[Incremental Indexing]], and the extracted context turns out to be surprisingly good ranking signal, which surprised me — see [[Ranking Search Results in a Vault]].
