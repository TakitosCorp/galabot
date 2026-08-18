# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.2] - 2026-08-18

### Fixed

- Discord interaction timeout error (10062 "Unknown Interaction") in `/ban` and `/warn` commands when performing long-running operations (DM + API ban/timeout calls). Discord interactions must be acknowledged within 3 seconds; the fix adds `deferReply()` before long operations and uses `editReply()` to update the deferred response instead of attempting a new `reply()` that would fail after the timeout window.

## [1.1.1] - 2026-08-13

### Fixed

- Docker build failed on `npm ci` after the `better-sqlite3` 12→13 bump: no prebuilt binary is published for `linux/arm64` on this Node ABI, so it falls back to compiling via `node-gyp`, which needs Python — and `node:22-slim` ships without it.

### Changed

- Dockerfile is now a multi-stage build: a `build` stage installs `python3`/`make`/`g++` (needed only to compile native modules like `better-sqlite3`/`sharp` when no prebuilt binary matches) and runs `npm ci --omit=dev`; only the resulting `node_modules` is copied into the final runtime image, which never carries the build toolchain or dev dependencies. Also dropped the vestigial `wget` apt package (unused at runtime).
- `init.sh` now stops the container, removes the old locally-built image (`docker compose down --rmi local`), pulls the latest code (`git pull`), then rebuilds and restarts — previously it only rebuilt/restarted without updating the code or clearing the old image first.

## [1.1.0] - 2026-08-13

### Added

- Slash commands now publish to Discord automatically on every bot startup (`events/discord/clientReady.js`), using the same delete-then-recreate strategy as the old manual script. Adding a new file under `commands/discord/` no longer requires remembering to separately run `npm run generate-cmds` — restarting the bot is enough (the command still exists for an immediate republish without restarting).
- `utils/discord/loadCommands.js`: shared directory-scan for `commands/discord/*.js`, now used by both the runtime command loader and the Discord publish path so they can never read a different file list from one another. Throws a clear error if two command files export the same `data.name`.
- `utils/discord/publishCommands.js`: extracted, reusable delete-then-recreate Discord REST publish function, shared by the automatic startup publish and `npm run generate-cmds`.
- `utils/discord/validateEmojis.js`: startup check that scans every `{emojis.X}` placeholder used in `data/resources.json`'s greeting templates and logs a warning for any name missing from `data/emojis.json`, so a guild emoji rename/resync can't silently ship broken greeting text again.
- `.env.example` now documents the `REACTION_ROLE_{GROUP}_EMOJI*` format (it was a real, working, README-documented feature that was completely undocumented there).

### Fixed

- `package.json`'s `sync-emojis` script pointed at a non-existent file (`utils/generators/botEmojis.js`); the real file is `utils/helpers/botEmojis.js`.
- `utils/helpers/botEmojis.js` itself computed its output path relative to its own file location (`utils/data/`) instead of the repo-root `data/` directory that the bot actually reads from — a stale path left over from before the file was moved into `utils/helpers/`. Every previous `sync-emojis` run had been writing to the wrong place.
- Renamed the `/scam-image` slash command to `/scamimage` for naming consistency with every other command (`aidocs`, `ban`, `forcepolling`, `rules`, `warn` — none use dashes).
- README: corrected two stale `utils/generateCmds.js` path references (real path is `utils/generators/generateCmds.js`), rewrote five "run `npm run generate-cmds` after adding a command" instructions to reflect the new automatic behavior, and fixed the "Current commands" table (wrong names `/ai-docs`/`/force-polling` instead of the actual `aidocs`/`forcepolling`, missing `/ban` entirely, and `/aidocs`'s permission was listed as none when it actually requires Manage Messages).
- Fixed a stale JSDoc `@typedef` import path (`utils/types` → `utils/core/types`, the file's real location) in `handlers/discord/startup.js` and `commands/discord/scamimage.js`.

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
