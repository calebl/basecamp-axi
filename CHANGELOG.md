# Changelog

## Unreleased

### Changed

- `subtask create` takes several titles in one call and creates them in order. If one fails, the error names the subtasks already created and the command that adds the rest. The hints after `todo create` and `todo view` show the one-call form.
- Acting on a trashed item fails fast with a `TRASHED` error and a restore hint, and changes nothing. This covers `todo done|reopen`, `subtask create`, `card move|update`, and `comment create`. Basecamp itself reports success for some of these writes without applying them: a completed trashed to-do stays open, and a moved trashed card is restored to the board. `todo view` shows a trashed to-do's status as `trashed`.

## 0.2.0

### Added

- `subtask create` adds one subtask to a to-do or card.
- `upload <file>` uploads one file to the project's Docs & Files root.

### Changed

- An unknown-command error from an older `basecamp` CLI now maps to `DEPENDENCY_OUTDATED`.

## 0.1.0

- Initial release.
