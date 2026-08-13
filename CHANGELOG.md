# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.1] - 2026-08-13

### Added

- `/ban` command: permanently bans a user and deletes up to 7 days of their messages (configurable via `delete_days` option, default 7).

### Changed

- Reformatted `commands/discord/scamimage.js` and `db/database.js` to match Prettier's line-length rules (no behavior change).
- Ignored `repomix-output.xml` in `.gitignore`.
