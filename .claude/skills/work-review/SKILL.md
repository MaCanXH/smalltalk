---
name: work-review
description: Summarize the work done in the current session into a Notion-style work review markdown file under docs/. Use when asked to summarize the session, write a work review, recap what was done, or document the session's work.
---

# Write a session work review

Produce a Notion-note-style markdown review of the session's work and save it to `docs/work-review-<topic-slug>.md` (kebab-case topic, e.g. `work-review-supabase-backend.md`). If a review for the same topic already exists, update it instead of creating a duplicate.

These reviews are **local notes only** — the entire `/docs/` folder is git-ignored. Never stage, commit, or push anything in it, and never remove that ignore rule.

An example of the finished format: `docs/work-review-supabase-backend.md`.

## Gather before writing

- Re-read the conversation: what was requested, what was decided, what was actually changed vs. only discussed.
- Check `git status` / recent commits for the real file list — report only what genuinely happened (unstaged, committed, reverted, etc.).
- Identify **one central problem** the session's work solved. If several candidates exist and the choice isn't obvious, pick the one the work actually addressed, state that judgment call to the user, and offer to restructure. Secondary problems become callouts or follow-ups, not the main subject.

## Required structure (in this order)

1. **Title + properties line** — `# 📋 Work Review — <Topic>`, then a `>` blockquote with Notion-style properties: Type, Project, Area · Date, Status (e.g. `✅ Shipped (n open issues)`), Owner (git user).

2. **✅ Work Conclusion** — first content section. Bulleted list of what shipped, each bullet tagged with an emoji and naming the concrete files/artifacts (as `path` inline code). End with anything **explicitly out of scope by decision**.

3. **🧩 The Problem, in Detail** — describe the central problem as numbered concrete pains (risk, constraints, why it mattered), not vague statements. Put discovered-but-unsolved side issues in a `> ⚠️` callout with recovery steps / next step.

4. **🛠 Solutions** — three mandatory sub-parts:
   - **a. Potential solutions considered** — a table: `# | Decision | Options suggested | Chosen` (✅ mark the chosen column). One row per decision made, listing *all* options that were on the table, with the chosen one bolded in the options list.
   - **b. Tradeoff in one sentence** — a single sentence comparing what the chosen combination trades away vs. what each rejected alternative would have sacrificed.
   - **c. Solution chosen & why it works best here** — bold statement of the chosen solution, then bullets explaining why it fits *this codebase specifically* (reference real architecture facts, not generic pros).

5. **🔍 Review Notes** — retrospective with three sub-lists:
   - **What went well** — process wins, avoided rework.
   - **What was tricky** — surprises, UI/API drift, errors hit and how they were resolved.
   - **Known gaps / follow-ups** — `- [ ]` checkboxes, each with an emoji tag, covering open bugs, edge cases, uncommitted work, and deferred options.

## Style rules

- Notion note idiom: emoji-prefixed `##` headers, `---` dividers between sections, `>` callouts for warnings/asides, checkbox lists for follow-ups.
- Ground every claim in the session: name real files, commands, and error messages; never pad with generic advice.
- Keep it honest — distinguish shipped vs. discussed vs. reverted; include open problems even if unflattering.
- After saving, tell the user the file path, map the sections to their request, and surface any judgment calls made (e.g. which problem was chosen as central).
