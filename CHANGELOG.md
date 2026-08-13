# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.2] - 2026-08-13

### Changed

- Updated every dependency to its latest release, including major bumps: `@google/genai` (1→2), `@twurple/api`/`auth`/`chat`/`eventsub-ws` (7→8), `better-sqlite3` (12→13), `kysely` (0.28→0.29), `puppeteer` (24→25), plus in-range bumps for `discord.js`, `@discordjs/rest`, `axios`, `discord-api-types`, `sharp`, and `prettier`. None of these required code changes for how GalaBot uses them.
- Removed the hard-pinned `undici` override — it was forcing a version with 3 known moderate-severity CVEs; letting `@discordjs/rest`/`discord.js` resolve it naturally now picks up the patched `6.28.0`.
- Bumped transitive `protobufjs` to fix a moderate-severity DoS advisory (`npm audit` is now clean).
- Switched `puppeteer.launch()`'s `headless: "new"` to `headless: true` (the non-deprecated modern equivalent, same behavior).
- Added `engines.node` (`>=22.0.0`) to `package.json`, matching the Dockerfile's `node:22-slim`.

## [1.0.1] - 2026-08-13

### Added

- `/ban` command: permanently bans a user and deletes up to 7 days of their messages (configurable via `delete_days` option, default 7).

### Changed

- Reformatted `commands/discord/scamimage.js` and `db/database.js` to match Prettier's line-length rules (no behavior change).
- Ignored `repomix-output.xml` in `.gitignore`.
