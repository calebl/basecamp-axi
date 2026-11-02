# Changelog

## 0.3.0

### Added

- `timesheet list|report|view|create|update|delete` for Basecamp timesheets. `delete` permanently removes one entry and is a dry run without `--confirm`. `update` with values that already match is a no-op. A bare "access denied" from Basecamp explains that Timesheet may be turned off for the account.
- `hill view|track|untrack|update|updates` for hill charts. `track` and `untrack` skip lists already in place, and `update` that moves dots to where they already sit, without a note, is a no-op.
- `timesheet view|create|update|delete`, `hill update` and `hill updates` need basecamp CLI 0.22.0 or newer and check the installed version first, failing with `DEPENDENCY_OUTDATED` on older CLIs.

### Changed

- `subtask create` takes several titles in one call and creates them in order. If one fails, the error names the subtasks already created and the command that adds the rest. The hints after `todo create` and `todo view` show the one-call form.
- Acting on a trashed item fails fast with a `TRASHED` error and a restore hint, and changes nothing. This covers `todo done|reopen`, `subtask create`, `card move|update`, and `comment create`. Basecamp itself reports success for some of these writes without applying them: a completed trashed to-do stays open, and a moved trashed card is restored to the board. `todo view` shows a trashed to-do's status as `trashed`.
- Unknown-subcommand errors name the parent command.

### Benchmark

- The read and write suites were rebalanced toward how agents use Basecamp in recorded sessions. Timesheet and hill chart tasks were added as coverage, and a trashed-to-do safety probe was added. Results were republished for this release, with the timesheet tasks left out because Timesheet is not enabled on the bench account; earlier runs moved under `history/`.
- The harness now confirms, before any axi session, that the agent's shell runs this checkout's build. It meters the LLM judge's spend and can re-judge saved read runs (`bench regrade`).

## 0.2.0

### Added

- `subtask create` adds one subtask to a to-do or card.
- `upload <file>` uploads one file to the project's Docs & Files root.

### Changed

- An unknown-command error from an older `basecamp` CLI now maps to `DEPENDENCY_OUTDATED`.

## 0.1.0

- Initial release.
