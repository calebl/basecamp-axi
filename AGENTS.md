# AGENTS.md

basecamp-axi is an agent-ergonomic TypeScript CLI that wraps the Basecamp CLI (`basecamp`) and prints compact TOON output.

## Commands

- Install: `npm ci`
- Build and typecheck: `npm run build` (runs `tsc`, output in `dist/`)
- Test: `npm test` (builds, then runs `node --test "dist/test/*.test.js"`)
- Check the bundled skill is current: `npm run check:skill` (regenerate with `npm run build:skill` after `npm run build`)

There is no separate lint step.

## Layout

- `bin/basecamp-axi.ts`: CLI entry point; `src/cli.ts` dispatches to `src/commands/`
- `test/`: tests, using a fake `basecamp` binary (`test/fake-basecamp.ts`)
- `skills/basecamp-axi/`: generated agent skill, built by `scripts/build-skill.ts`

## Working rules

- Put temporary probes, scratch tests and generated output under /tmp or a gitignored directory, and make sure `git status` is clean of them before reporting work done.
- Report checks as passed only after every check has finished and exited 0; name any check you did not run.
