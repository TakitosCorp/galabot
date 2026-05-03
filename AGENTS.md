# AGENTS.md

Conventions for contributing to GalaBot. Anything you (human or agent) add to
this codebase **must** follow the JSDoc and logging standards below — they
exist so the bot stays self-documenting in the IDE and debuggable from logs
alone.

---

## 1. Project shape (orient yourself first)

```
main.js                  → env validation + bootstrap
clientManager.js         → owns every long-lived platform client
db/                      → Kysely + better-sqlite3 helpers
handlers/<platform>/     → wires events/commands at startup
events/<platform>/       → per-event logic
commands/discord/        → slash command modules
messages/<platform>/     → response builders (reply text, embeds)
utils/                   → cross-cutting utilities (loggers, constants, types,
                           image gen, token mgmt, pollers, schedule)
lang/                    → localised string tables (en/es)
templates/               → Puppeteer HTML templates (out of scope for JSDoc)
data/                    → runtime state (sqlite db, token cache, JSON caches)
logs/                    → Winston output (auto-created)
```

- Module system: **CommonJS** (`require` / `module.exports`).
- Language: **plain JavaScript**, no TypeScript. Types live in JSDoc only.
- Top of every source file starts with `"use strict";` after the module header.

---

## 2. JSDoc standard

### 2.1 File header — required on every `.js` file

```js
/**
 * @module path/to/module
 * @description
 * One or two sentences explaining what this module is responsible for.
 * Mention non-obvious behaviour or side effects here, not at call sites.
 */
```

- Path matches the location relative to the project root, no leading `./`.
- For lang/data files, a short header is enough — do **not** annotate every
  string in a localisation table.

### 2.2 Functions

Every exported function **and** every internal helper of more than a couple of
lines gets a JSDoc block:

```js
/**
 * Short imperative description ("Fetch the most recent stream …").
 *
 * @async                          ← only when the function is async
 * @param {Type} name - Description of the parameter.
 * @param {Type} [optional] - Mark optional params with brackets.
 * @returns {Type} Description of the returned value.
 * @throws {Error} When and why this rejects/throws (omit if it never throws).
 */
```

Rules:

- Use real types (`string`, `number`, `Promise<StreamRow|null>`,
  `import('discord.js').Message`). Never `any` unless genuinely opaque.
- For Kysely transactions / clients, type as
  `import('kysely').Kysely<any>|import('kysely').Transaction<any>`.
- Document the **why**, not the **what** the code already says. If the body is
  obvious, a single-line `@description` is fine.

### 2.3 Classes

```js
/**
 * One-sentence purpose.
 * @class
 */
class Foo {
  /**
   * What `new Foo(...)` initialises.
   */
  constructor() {
    /** @type {SomeType|null} */
    this.field = null;
  }

  /**
   * Per-method block as above.
   * @async
   * @returns {Promise<void>}
   */
  async doThing() { … }
}
```

Annotate instance fields with `@type` on the line above the assignment in the
constructor.

### 2.4 Constants

In `utils/constants.js` every export has its own block:

```js
/**
 * Why this value exists, what unit it's in, and any non-obvious constraint.
 * @type {number}
 * @constant
 */
EXAMPLE_DURATION_MS: 60 * 1000,
```

Same rule for any other module that exports tunables.

### 2.5 Shared types — single source of truth

Cross-module shapes (DB rows, event payloads, state machines, log helpers) live
in [utils/types.js](utils/types.js). Pull them in via `import()` typedefs:

```js
/**
 * @typedef {import('../utils/types').StreamRow} StreamRow
 * @typedef {import('../utils/types').WarnRow} WarnRow
 */
```

When you introduce a new shape that two or more files care about, add it to
`utils/types.js` rather than redeclaring it locally.

### 2.6 Event/command module shapes

Discord event handlers and slash commands have stable shapes typed in
`utils/types.js` — annotate the export:

```js
/** @type {import('../../utils/types').DiscordEventHandler} */
module.exports = { name, once, async execute(...) {} };

/** @type {import('../../utils/types').DiscordSlashCommand} */
module.exports = { data: new SlashCommandBuilder()…, async execute(...) {} };
```

### 2.7 Comments — when *not* to write them

- Don't restate what well-named code already says.
- Don't reference the current task or PR ("added for X flow").
- Inline comments only when the **why** is non-obvious (a hidden constraint,
  a workaround, behaviour that would surprise a reader).

---

## 3. Logging standard

### 3.1 Use the right channel

Five Winston channels live in [utils/loggers.js](utils/loggers.js):

| Channel | When to use it |
| --- | --- |
| `discordLog` | Anything inside Discord events, commands, message handlers. |
| `twitchLog` | Twitch chat, EventSub, token, viewer-poll, schedule helpers. |
| `youtubeLog` | YouTube poller, fast/slow polls, stream start/end events. |
| `dbLog` | Every `db/*.js` query helper. |
| `sysLog` | Lifecycle, env validation, file utils, image generator, anything cross-cutting. |

Each channel writes to `logs/<channel>.log` *and* `logs/combined.log` *and* the
console — pick by **domain**, not by destination.

### 3.2 Call signature

```js
logger(level, 'module:action short message', { contextKey: value, ... });
```

- `level`: `'error' | 'warn' | 'info' | 'debug'` (also `verbose`/`silly` if needed).
- Message: short, lowercase-ish, **`module:action` prefix** so logs are greppable
  (e.g. `'streams:insertStream'`, `'twitch:eventsub subscribed'`).
- Context: optional 3rd arg, an object that gets JSON-serialised and appended
  as ` | { … }`. Put variables here, **never** interpolate them into the
  message string.

Good:

```js
dbLog('debug', 'streams:getStreamById', { streamId });
discordLog('info', 'warn:timeout-applied', {
  target: user.username,
  targetId: user.id,
  minutes: timeoutDuration / 60000,
  issuer: interaction.user.username,
  warnCount: newWarnCount,
});
```

Bad:

```js
dbLog('debug', `getStreamById(${streamId})`);            // variable in message
discordLog('info', 'Did a thing for ' + user.username);  // no module: prefix
```

### 3.3 Level guidance

- **`debug`** — entry/exit of meaningful functions, state transitions, retry
  attempts, cache hit/miss, "no result" branches, parameter-shape diagnostics.
  Free to be chatty; this is what makes hard bugs debuggable.
- **`info`** — lifecycle (`bootstrap start/complete`, `client ready`,
  `stream announcement posted`, `webhook posted`) and **completed** business
  actions (`warn:banned`, `streams:viewerAverage updated`).
- **`warn`** — recoverable failures and unexpected-but-handled conditions:
  missing optional config, channel-not-text, DM rejected, getUser failed,
  webhook 5xx, schedule 404, no-active-stream, quota fallback activated.
- **`error`** — anything that hit a `catch` and needed reporting. **Always**
  pass `err: err.message` and `stack: err.stack` plus enough context to
  identify the failing entity (id of the user/stream/video/command).

### 3.4 Errors — the rule

Never write `try { … } catch (_) {}`. If something can fail and you don't want
the error to propagate, log it:

```js
try {
  await doStuff();
} catch (err) {
  twitchLog('error', 'twitchViews:tick failed', {
    streamId,
    err: err.message,
    stack: err.stack,
  });
}
```

If you *do* want it to propagate, log first then rethrow:

```js
} catch (err) {
  dbLog('error', 'streams:insertStream failed', {
    id: streamData.id,
    err: err.message,
    stack: err.stack,
  });
  throw err;
}
```

DB helpers in `db/*.js` follow the second pattern (callers decide on
user-facing fallbacks). Event handlers (`events/**`) follow the first
(EventSub/discord listeners must keep running).

### 3.5 No `console.*` in runtime code

`console.log` / `console.error` are reserved for the standalone CLI scripts
under `utils/` (`botEmojis.js`, `generateCmds.js`) that run outside the bot's
lifecycle. Anywhere else, use the appropriate domain logger. The single
exception is the **pre-logger** fatal in `main.js#validateEnv` — the env check
runs before Winston is meaningful, so `console.error + process.exit(1)` is
correct there.

### 3.6 What to put in the context object

- Identifiers: `userId`, `targetId`, `streamId`, `videoId`, `discMsgId`,
  `channelId`, `guildId`, `broadcasterId`, `command`.
- Quantities: `count`, `samples`, `viewers`, `durationMs`, `bytes`.
- Timestamps: ISO strings only (`endTime: new Date().toISOString()`).
- For errors: `err: err.message, stack: err.stack` (and any of the above).
- Avoid: full Discord/Twitch objects, raw user message content, tokens of
  any kind. Privacy and log-size both matter.

---

## 4. Error-handling patterns by layer

| Layer | Pattern |
| --- | --- |
| **Database (`db/*.js`)** | `dbLog('debug', …)` on entry. Wrap the query in `try/catch`; on error `dbLog('error', …, { err, stack })` then **rethrow**. Caller decides on fallback. |
| **Event handlers (`events/**`)** | Wrap the **whole** `execute` body in `try/catch`. On error log with full context but **swallow** — the EventSub / discord.js listener must stay registered. |
| **Slash commands (`commands/discord/*`)** | Don't wrap; the dispatcher in `events/discord/interactionCreate.js` already catches, logs and replies ephemerally. |
| **Utilities (`utils/*`)** | Match the contract: token/poller/schedule helpers can throw and let the caller decide; long-running pollers (`twitchViews`, `youtubePoller`) catch internally and keep ticking. |

---

## 5. Adding a new module — checklist

1. Pick the right directory (events vs handlers vs messages vs utils).
2. Start the file with the standard header:
   ```js
   /**
    * @module …
    * @description …
    */

   "use strict";
   ```
3. If you're introducing a shape used in another file, add a `@typedef` to
   `utils/types.js` rather than redeclaring it locally.
4. Pick the right logger and add `debug` entry logs to every meaningful
   function, plus the `info`/`warn`/`error` lines that match the rules above.
5. JSDoc every export and any non-trivial internal helper.
6. Run `node --check <file>` before committing — there's no transpile step,
   so the syntax check is the cheapest correctness gate we have.

---

## 6. Adding a new constant or env var

- New constant → goes in [utils/constants.js](utils/constants.js) with a full
  `@type`/`@constant` JSDoc block.
- New required env var → add it to `REQUIRED_ENV` in [main.js](main.js) so the
  bot fails fast on missing config. Optional env vars are documented in
  the JSDoc of whichever module reads them (e.g. `YOUTUBE_API_KEY_2` is
  described in `utils/youtubePoller.js`).

---

## 7. Smoke testing changes

Full runtime startup needs valid Twitch tokens, a Chromium binary, and YouTube
credentials, so it's only practical in production. For local changes:

- `node --check <file>` — parse-time correctness.
- Boot the bot in a dev guild with `ENABLE_TWITCH=false ENABLE_YOUTUBE=false`
  to exercise just the Discord path, or the inverse to exercise streaming.
- Tail `logs/<channel>.log` to verify your new `debug`/`info` lines appear at
  the points you expect — this is also the fastest way to spot a missing
  `module:action` prefix.

---

## 8. What *not* to add

- No ESLint/Prettier config — keep diffs focused on behaviour.
- No TypeScript migration without a separate, scoped task.
- No `LOG_LEVEL` env var or per-call level toggles. Winston's level
  hierarchy is enough; if `debug` is too noisy in prod, fix it at the
  Winston transport in `utils/loggers.js`.
- No HTML doc site / `jsdoc` CLI dependency. JSDoc lives in source for IDE
  intellisense; that's the deliverable.
- No `console.*` in runtime code (see §3.5).
- No `try { … } catch (_) {}` swallows (see §3.4).
