# ECC Token Optimization Prompt

Paste this into Claude Code inside the project you want audited. It detects the project's actual stack and tailors ECC's rules, skills, hooks, and model routing accordingly instead of running the "install everything" default.

## DataOne-specific context (pre-filled so the audit doesn't have to re-derive it)

- **Detected stack:** Python 3 / FastAPI / Celery / SQLAlchemy backend (`backend/requirements.txt`) + Next.js 16 / React 19 / TypeScript frontend (`frontend/package.json`, Tailwind 4, Vitest). No Go, PHP, Java, Kotlin, Swift, C#, C++, Rust, Dart/Flutter, Perl, Vue, Angular, or Nuxt anywhere in the repo.
- **ECC install:** global user-scope plugin at `~/.claude/plugins/marketplaces/ecc` (v2.0.0), no per-project selective-install manifest (`ecc-install.json`) exists — this is the full "install everything" default (281 skills / 67 agents / 22 rule language-dirs available). `scripts/install-plan.js` currently fails locally (`Cannot find module 'ajv'` — plugin's own `node_modules` is incomplete), so selective-install can't be resolved via the script until that dependency is restored; treat that as a separate finding, not something to fix as part of this audit.
- **Rules dirs are global, not project-scoped:** there is no `.claude/rules` in this repo, only `~/.claude/plugins/marketplaces/ecc/rules`, which is shared by every project this ECC install is used on. Any directory removed there affects other projects too — flag removal candidates, don't delete without explicit approval.
- **CI is deploy-only:** `.gitlab-ci.yml` has a single stage that SSHes into a host and runs `git pull && docker compose up -d --build` on push to `main` — there is no lint/test/typecheck gate in CI. Local Stop hooks (`stop:format-typecheck`, `stop:check-console-log`) are effectively the only automated safety net, which should weigh against disabling them.
- **Model routing:** already partially configured via each agent's YAML frontmatter (`model: haiku|sonnet|opus` in `~/.claude/plugins/marketplaces/ecc/agents/*.md`), not a separate routing config file — e.g. `doc-updater` → haiku, `build-error-resolver`/`refactor-cleaner` → sonnet, `architect`/`planner` → opus, `security-reviewer` → sonnet. Check whether this default tiering is good enough before proposing a new one.

---

```
Audit and configure this project's Everything Claude Code (ECC) setup to minimize token overhead, tailored to what this project actually uses. Do the following:

1. Detect the real stack: inspect package.json, requirements.txt/pyproject.toml, go.mod, composer.json, Package.swift, etc. in this repo to determine which language(s) are actually in use. Do not assume — check the files.

2. Rules: check whether ~/.claude/rules or .claude/rules currently has more language directories installed than this project uses (e.g. python + golang + swift all present but this repo is TypeScript-only). Remove or flag directories that don't match the detected stack, and confirm rules/common plus only the matched language directory(ies) remain.

3. Skills/agents: list which ECC skills and agents are currently installed (check .claude-plugin, or wherever ECC was installed) and identify any that are irrelevant to the detected stack (e.g. django-*, springboot-*, laravel-* skills when this is a Node project). Report what could be uninstalled or excluded via the selective-install manifest (install-plan.js/install-apply.js) instead of the full profile.

4. Hooks: read hooks/hooks.json and report which hooks are active. Recommend an ECC_HOOK_PROFILE setting (minimal/standard/strict) appropriate for this project's size and CI setup, and list any hook IDs (e.g. tmux-reminder, typecheck) that look safe to add to ECC_DISABLED_HOOKS given how this project is actually built and tested. Write the recommended exports to a .env.local or equivalent config file used by this project — do not hardcode secrets, just the ECC_HOOK_PROFILE and ECC_DISABLED_HOOKS values.

5. Model routing: check whether /model-route is configured. If not, propose a routing config that sends mechanical subagents (build-error-resolver, doc-updater, refactor-cleaner) to a smaller/faster model and reserves the larger model for architect/planner/security-reviewer.

6. Continuous learning: run /instinct-status to show accumulated instincts. If there are stale or low-confidence ones, run /prune. Run skill-stocktake and report any installed skills with low or no usage so I can decide whether to remove them.

7. Summarize everything you changed vs. everything you're only recommending (don't auto-remove skills/rules without listing them first for my approval). End with a short table: setting, current value, recommended value, why.

Do not modify hooks.json's core structure or plugin.json — only touch env vars, rules directory contents, and provide recommendations for skill/agent selection.
```
