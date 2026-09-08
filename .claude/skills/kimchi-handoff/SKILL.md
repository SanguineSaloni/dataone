---
name: kimchi-handoff
description: Use when delegating a task in this repo to Kimchi, the small-context coding agent, so its limited context budget isn't blown handing it the whole tree.
---

Kimchi's context budget is tight — don't hand it this whole tree at once.

- Point Kimchi at **one** `SKILLS.md` playbook plus the **one** relevant `prompts/NN-*.md` file for the task at hand, not the full set.
- Give Kimchi exact file paths (from the repo map in `CLAUDE.md`) instead of asking it to explore.
- Keep task instructions to a single concrete diff. Split multi-file epics into one `INDEX.md` line item per Kimchi invocation.
- Have Kimchi read the last 3–5 entries of `MEMORY.md`, not the whole file, unless doing a fresh session review.
