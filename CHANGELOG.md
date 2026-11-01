# Changelog

## 0.2.0

### Added

- `subtask list|create|done|reopen` for to-do subtasks. `create` takes several titles in one call and skips titles the parent already has; `done` and `reopen` are idempotent. `todo create --subtask` creates subtasks inline.
- `upload <file>` and `upload list` for Docs & Files. Re-uploading a same-name, same-size file is a no-op; a same-name file with different content is a `CONFLICT` unless `--force`.
- `--attach <path>` (repeatable) on `todo create`, `message create`, and `comment create`.

### Changed

- An unknown-command error from an older `basecamp` CLI now maps to `DEPENDENCY_OUTDATED`.

## 0.1.0

- Initial release.
