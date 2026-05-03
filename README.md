
# GalaBot

GalaBot is a multi-platform streaming companion bot for a single content creator's community. It bridges **Discord**, **Twitch**, and **YouTube** in one Node.js process: announcing streams as they go live, generating custom banner images, moderating Discord chat, greeting users, and persisting per-stream stats to a local SQLite database. It is built around the streamer "Gala" (a dinosaur mascot), but the codebase is generic enough to be reused — every channel ID, role, and credential is loaded from environment variables.

If you want the 60-second path: skip to [Quick start (Docker)](#quick-start-docker).
If you want to extend the bot: skip to [How things work (developer guide)](#how-things-work-developer-guide).

---

## Table of contents

- [Feature highlights](#feature-highlights)
- [Architecture overview](#architecture-overview)
- [Quick start (Docker)](#quick-start-docker)
- [Quick start (local Node)](#quick-start-local-node)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Discord setup walkthrough](#discord-setup-walkthrough)
- [Twitch setup walkthrough](#twitch-setup-walkthrough)
- [YouTube setup walkthrough](#youtube-setup-walkthrough)
- [Running](#running)
- [Project layout](#project-layout)
- [How things work (developer guide)](#how-things-work-developer-guide)
- [Templates](#templates)
- [Common tasks (recipes)](#common-tasks-recipes)
- [Database schema reference](#database-schema-reference)
- [Operations & troubleshooting](#operations--troubleshooting)
- [Known gaps](#known-gaps)
- [License & credits](#license--credits)

---

## Feature highlights

**Discord**

- Slash commands: `/rules` (post or DM the server rules) and `/warn` (warn → timeout → ban escalation).
- Greeting responses with a per-user cooldown (greetings on Discord and Twitch share the same cooldown).
- Auto-moderation: pinging the bot directly issues a warning automatically.
- Stream announcements posted as rich embeds with a custom-rendered banner attachment and an optional role mention; the same message is updated when the stream ends with the final stats.

**Twitch**

- Connects to chat as a configurable bot account (Twurple).
- Subscribes to `stream.online` / `stream.offline` events via EventSub WebSocket — no polling, near-instant notifications.
- Samples viewer count every 60 s during a live stream and stores a running average.
- Fetches the Twitch schedule on stream end and renders a "next streams" image into the end-of-stream embed.
- Auto-refreshes Twitch OAuth tokens; nothing manual after first setup.

**YouTube**

- Detects live streams via a polling state machine. Two cadences: a slow poll (every 3 h, ~100 quota units) discovers upcoming/live videos, and a fast poll (every 1 minute, 1 quota unit) tracks state transitions. Total cost is well under the daily 10 k quota.
- Periodically fetches and caches YouTube categories (every 48 h) to dynamically map category IDs to readable category names for the stream embeds.
- Optional fallback API key kicks in if the primary key is exhausted.
- Resumes tracking automatically after a restart if a stream is still live.

**Image generation**

- Stream banners and followup images are HTML templates rendered with headless Chromium (Puppeteer) and attached to the Discord embed. They dynamically adapt colors and links based on the platform (Twitch or YouTube).

**Localization**

- English and Spanish, selected per Discord channel via `SPANISH_CHANNEL_ID`. All user-facing strings live in `lang/`.

**Persistence**

- SQLite (better-sqlite3 + Kysely query builder). Tables for greetings, warns, Twitch streams, and YouTube streams are created on first boot.

---

## Architecture overview

```text
                            ┌────────────────────┐
                            │      main.js       │
                            │ (env validation)   │
                            └─────────┬──────────┘
                                      │
                            ┌─────────▼──────────┐
                            │  clientManager.js  │
                            │ (lifecycle owner)  │
                            └─┬────────┬────────┬┘
                              │        │        │
              ┌───────────────┘        │        └──────────────┐
              │                        │                       │
     ┌────────▼────────┐    ┌──────────▼──────────┐   ┌────────▼────────┐
     │ handlers/discord│    │  handlers/twitch    │   │  handlers/youtube │
     │   /startup.js   │    │    /startup.js      │   │    /startup.js    │
     │                 │    │                     │   │                   │
     │ auto-loads      │    │ wires Twurple       │   │ schedules slow    │
     │ commands/ +     │    │ chat + EventSub     │   │ + fast poll loops │
     │ events/discord/ │    │                     │   │                   │
     └────────┬────────┘    └──────────┬──────────┘   └────────┬────────┘
              │                        │                       │
              └───────┬────────────────┴───────────────────────┘
                      │
            ┌─────────▼──────────┐    ┌──────────────────────┐
            │  db/ (Kysely)      │    │ utils/imageGenerator │
            │  greetings, warns, │    │ (Puppeteer + HTML    │
            │  streams           │    │  templates/)         │
            │  (all providers)   │    │                      │
            └────────────────────┘    └──────────────────────┘

         Logging is per-platform via Winston (utils/loggers.js → logs/*.log)
```

Three properties worth keeping in mind as you read the code:

1. **`clientManager` is the single owner of every long-lived resource** (Discord client, Twurple chat client, EventSub listener, YouTube polling intervals, Puppeteer browser). Shutdown is centralized in `clientManager.js`.
2. **Each platform is independently toggleable.** Setting `ENABLE_DISCORD=false` / `ENABLE_TWITCH=false` / `ENABLE_YOUTUBE=false` skips its initialization entirely. All three default to enabled.
3. **Only Discord auto-loads handlers from disk.** Discord scans `events/discord/` and `commands/discord/` at startup. Twitch and YouTube wire their handlers up explicitly inside `handlers/<platform>/startup.js`.

---

## Quick start (Docker)

Prerequisites: Docker and Docker Compose.

```bash
git clone <your-repo-url>
cd GalaBot
cp .env.example .env
# edit .env — fill in every value (see "Configuration" below)
docker compose up --build -d
docker compose logs -f bot
```

The container ships with Chromium pre-installed and `PUPPETEER_EXECUTABLE_PATH` already set, so image generation works out of the box. Persistent state lives in `./data/` and logs in `./logs/` on the host.

To rebuild and restart in one shot, the repo includes `init.sh`:

```bash
bash init.sh
```

To register Discord slash commands the first time (or any time you change them):

```bash
docker compose exec bot node utils/generateCmds.js
```

---

## Quick start (local Node)

Prerequisites: Node.js 22+, npm, and a Chromium/Chrome binary on the system for Puppeteer.

```bash
git clone <your-repo-url>
cd GalaBot
cp .env.example .env
# edit .env (see "Configuration" below)
npm install
npm run generate-cmds   # one-time: register slash commands with Discord
npm start
```

Notes:

- On Linux (apt-based), `sudo apt install chromium` and set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` in `.env`.
- On macOS, point `PUPPETEER_EXECUTABLE_PATH` at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (or install Chromium via Homebrew).
- On Windows, point `PUPPETEER_EXECUTABLE_PATH` at e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- `data/` and `logs/` are created automatically on first run.

---

## Configuration (environment variables)

`main.js` exits with `FATAL` if any of the **required** variables is missing. The committed `.env.example` lists every variable below.

### Discord

| Variable                       | Required | Description                                                                               |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`                | yes      | Bot token from the Discord Developer Portal.                                              |
| `DISCORD_ID`                   | yes      | Application (client) ID — used by `generate-cmds` to register slash commands.             |
| `GALA_DISCORD_ID`              | yes      | The bot account's user ID. Used to detect when a user pings the bot in chat.              |
| `DISCORD_NOTIFICATION_CHANNEL` | yes      | Channel ID where Twitch and YouTube stream notifications are posted.                      |
| `DISCORD_NOTIFICATION_ROLE_ID` | no       | Role ID mentioned in Twitch and YouTube stream notifications. Leave blank for no mention. |
| `SPANISH_CHANNEL_ID`           | no       | Channel ID treated as Spanish-locale. Any other channel falls back to English.            |

### Twitch

| Variable          | Required | Description                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------------------- |
| `TWITCH_CHANNEL`  | yes      | The Twitch channel name to monitor (without the `#`).                                 |
| `TWITCH_USERNAME` | yes      | The bot account's Twitch username (the account whose token is in `data/twitch.json`). |
| `TWITCH_URL`      | yes      | The streamer's Twitch URL to include in embeds.                                       |

### YouTube

| Variable             | Required    | Description                                                                                |
| -------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `YOUTUBE_CHANNEL_ID` | conditional | The YouTube channel ID to monitor (starts with `UC...`). Required when YouTube is enabled. |
| `YOUTUBE_API_KEY`    | conditional | YouTube Data API v3 key. Required when YouTube is enabled.                                 |
| `YOUTUBE_API_KEY_2`  | no          | Optional fallback key. Used when the primary key hits its 10 000 unit/day quota.           |
| `YOUTUBE_URL`        | yes         | The streamer's YouTube URL to include in embeds.                                           |

### Webhooks & toggles

| Variable                    | Required | Description                                                                                                                                                                      |
| --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST_DATA_WEBHOOK`         | yes      | URL that receives a POST with the stream data when a stream ends. Used for external analytics. Set to a placeholder (e.g. `https://example.com/noop`) if you don't have one yet. |
| `ENABLE_DISCORD`            | no       | Set to `false` to skip Discord initialization entirely.                                                                                                                          |
| `ENABLE_TWITCH`             | no       | Set to `false` to skip Twitch initialization entirely.                                                                                                                           |
| `ENABLE_YOUTUBE`            | no       | Set to `false` to skip YouTube initialization entirely.                                                                                                                          |
| `PUPPETEER_EXECUTABLE_PATH` | no       | Path to the Chromium/Chrome binary used by Puppeteer. Defaults to `/usr/bin/chromium` in Docker.                                                                                 |

### Tunable constants (not env vars)

If you want to change cooldowns, ban thresholds, or polling cadence, edit `utils/constants.js`:

| Constant                     | Default | Meaning                                                                                      |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `GREETING_COOLDOWN_MS`       | 4 h     | Time before a user can trigger a greeting response again. Shared between Discord and Twitch. |
| `WARN_TIMEOUT_BASE_MS`       | 10 min  | Per-warn timeout. A user with N warns gets a `N * 10 min` timeout.                           |
| `MAX_WARN_BEFORE_BAN`        | 3       | Number of warns at which the user is permanently banned.                                     |
| `MAX_WARN_REASON_LENGTH`     | 512     | Max characters allowed in a `/warn` reason.                                                  |
| `TOKEN_VALIDITY_MS`          | 59 days | How long a refreshed Twitch token is considered valid before re-refreshing.                  |
| `VIEWER_POLL_INTERVAL_MS`    | 60 s    | Twitch viewer-count sampling interval during a live stream.                                  |
| `YOUTUBE_FAST_POLL_MS`       | 60 s    | Cadence of the lightweight `videos.list` poll (1 quota unit per call).                       |
| `YOUTUBE_SLOW_POLL_MS`       | 3 h     | Cadence of the heavier `search.list` poll (100 quota units per call).                        |
| `YOUTUBE_CATEGORY_POLL_MS`   | 48 h    | Cadence for fetching and caching YouTube category mappings via the `videoCategories` endpoint.|
| `YOUTUBE_STREAM_VALID_HOURS` | 12      | How long after publish a discovered video is still tracked.                                  |
| `YOUTUBE_QUOTA_COOLDOWN_MS`  | 24 h    | Pause on `search.list` calls after a quota error.                                            |
| `PUPPETEER_*_TIMEOUT_MS`     | various | Puppeteer page/goto/screenshot/selector timeouts. Bump these on slow hardware.               |

---

## Discord setup walkthrough

1. **Create a bot** at https://discord.com/developers/applications → New Application → Bot tab → Reset Token (paste into `DISCORD_TOKEN`).
2. **Enable privileged intents** on the Bot tab: **Message Content Intent** is required (greetings and ping detection rely on reading message content). Server Members Intent is not needed.
3. **Copy the Application ID** from the General Information tab → `DISCORD_ID`.
4. **Invite the bot** to your server using the OAuth2 URL Generator with scopes `bot` and `applications.commands`, and these bot permissions:
   - View Channels, Send Messages, Embed Links, Attach Files, Use External Emojis (for greetings/notifications)
   - Manage Messages, Moderate Members, Ban Members (for `/warn` and auto-moderation)
5. **Find IDs** by enabling Developer Mode in Discord (Settings → Advanced), then right-clicking the channel/role/user → Copy ID. You'll need:
   - The bot's user ID → `GALA_DISCORD_ID`
   - The notification channel ID → `DISCORD_NOTIFICATION_CHANNEL` (used for both Twitch and YouTube announcements)
   - The role to ping for live streams → `DISCORD_NOTIFICATION_ROLE_ID` (optional, used for both Twitch and YouTube)
   - The Spanish channel ID, if you have one → `SPANISH_CHANNEL_ID`
6. **Register slash commands** once you've set `DISCORD_TOKEN` and `DISCORD_ID`:
   ```bash
   npm run generate-cmds
   ```
   This pushes the contents of `commands/discord/` to Discord's API. Re-run it any time you add, remove, or change a command's `SlashCommandBuilder`.
7. (Optional) **Sync custom emojis** if you maintain `data/emojis.json`:
   ```bash
   npm run sync-emojis
   ```

---

## Twitch setup walkthrough

There are two Twitch identities at play:

- **`TWITCH_CHANNEL`** — the streamer whose stream events you want to track. The bot will join this channel's chat.
- **`TWITCH_USERNAME`** — the bot account's username (the account that owns the OAuth token). Often a separate account from the streamer.

### Generating a Twitch token (first run only)

The bot uses [twitchtokengenerator.com](https://twitchtokengenerator.com/) to get and refresh tokens. The required scopes are at minimum **`chat:read`** and **`chat:edit`** for chat, plus the broadcaster scopes EventSub needs for `stream.online` / `stream.offline` (`user:read:email` is generally sufficient, plus standard helix read scopes).

The flow:

1. Visit the token generator while logged in to the bot account.
2. Pick the scopes above.
3. Authorize.
4. Copy the resulting **Client ID**, **Access Token**, and **Refresh Token** into `data/twitch.json`. The schema the bot expects:
   ```json
   {
     "CLIENT_ID": "your_twitch_client_id",
     "ACCESS_TOKEN": "your_access_token",
     "REFRESH_TOKEN": "your_refresh_token",
     "LAST_REFRESH": 0
   }
   ```
5. On the next boot, `utils/twitchToken.js` will refresh the token and update `LAST_REFRESH`. After that it auto-refreshes when the token is older than `TOKEN_VALIDITY_MS` (59 days).

If chat connects but EventSub fails, your token is missing a scope — regenerate with broader scopes and replace `data/twitch.json`.

---

## YouTube setup walkthrough

1. **Get an API key** from the Google Cloud Console → enable the **YouTube Data API v3** → create an API key. Paste into `YOUTUBE_API_KEY`.
2. **(Strongly recommended) Create a second key on a different project** for `YOUTUBE_API_KEY_2`. Each project gets its own 10 000 unit/day quota; the bot transparently falls back to the second key if the first is exhausted.
3. **Find the channel ID** of the streamer's YouTube channel — the 24-character ID starting with `UC`. Paste into `YOUTUBE_CHANNEL_ID`.
4. **Notifications** are posted to the same `DISCORD_NOTIFICATION_CHANNEL` (and pinged with the same `DISCORD_NOTIFICATION_ROLE_ID`) as Twitch announcements — no extra config needed.

### Quota math

A day-in-the-life of the YouTube poller, with default constants:

- Slow poll (`search.list`, 100 units): every 3 h → 8 calls/day → **800 units/day**.
- Fast poll (`videos.list`, 1 unit): every 1 min → 1 440 calls/day → **1 440 units/day**.
- Category mapping poll (`videoCategories`, 1 unit): every 48 h → **~0.5 units/day**.
- Total: ~2 240 units/day, well below the 10 000 unit limit.

If you tighten `YOUTUBE_SLOW_POLL_MS` to faster than ~25 minutes you'll start to push the daily quota; the bot detects 403 quota errors and pauses `search.list` calls for `YOUTUBE_QUOTA_COOLDOWN_MS` (24 h).

---

## Running

| Mode                    | Command                        | Notes                                                    |
| ----------------------- | ------------------------------ | -------------------------------------------------------- |
| Local development       | `npm start`                    | Logs to console + `logs/`.                               |
| Docker (foreground)     | `docker compose up --build`    | Useful for first run / debugging.                        |
| Docker (background)     | `docker compose up --build -d` | Restart policy is `always` (auto-restart on crash).      |
| Rebuild and restart     | `bash init.sh`                 | Convenience wrapper.                                     |
| Tail logs               | `docker compose logs -f bot`   | All Winston output.                                      |
| Register slash commands | `npm run generate-cmds`        | Or `docker compose exec bot node utils/generateCmds.js`. |

The bot handles `SIGTERM` and `SIGINT` gracefully: it stops Twitch viewer polling, closes Puppeteer, clears YouTube intervals, destroys the Discord client, and disconnects Twitch chat + EventSub before exiting.

---

## Project layout

```text
GalaBot/
├── main.js                    Entry point. Validates env, instantiates clientManager.
├── clientManager.js           Owns Discord/Twitch/YouTube clients and shutdown logic.
├── package.json               Dependencies and npm scripts.
├── Dockerfile                 Node 22-slim + Chromium for Puppeteer.
├── docker-compose.yml         Mounts ./data, ./logs, ./.env into the container.
├── init.sh                    Rebuild-and-restart helper.
├── .env.example               Template — copy to .env and fill in.
│
├── commands/discord/          Slash commands. Auto-loaded; one file per command.
│
├── events/                    Event handlers, organized by platform.
│   ├── discord/               Auto-loaded by handlers/discord/startup.js.
│   ├── twitch/                Wired up explicitly in handlers/twitch/startup.js.
│   └── youtube/               Wired up explicitly in handlers/youtube/startup.js.
│
├── handlers/                  Per-platform startup/bootstrap.
│
├── messages/                  Response builders (greetings, ping replies, etc.).
│
├── lang/                      Localized strings (en + es).
│
├── db/                        Kysely-backed SQLite layer.
│
├── utils/                     Shared helpers.
│
├── templates/                 Unified HTML templates for Puppeteer.
│   ├── streamBanner.html      Live stream template.
│   ├── streamFollowup.html    Upcoming schedule template.
│   └── streamEnded.html       Fallback end-of-stream template.
│
├── data/                      Runtime state (created on first boot, mounted in Docker).
│   ├── galabot.sqlite         SQLite database file.
│   ├── twitch.json            Cached Twitch tokens.
│   ├── resources.json         Greeting/response pool used at runtime.
│   ├── emojis.json            Custom emoji mapping.
│   └── youtubeCategories.json Cached YouTube category mappings.
│
└── logs/                      Winston log output (created on first boot).
```

---

## How things work (developer guide)

### Startup flow

`main.js` validates required env vars and instantiates `clientManager`. `clientManager.initialize()` ([clientManager.js:16](clientManager.js#L16)):

1. Calls `db/database.js → initialize()` to create tables if they don't exist.
2. Reads `ENABLE_DISCORD` / `ENABLE_TWITCH` / `ENABLE_YOUTUBE` and skips any platform set to the literal string `"false"`. (Anything else, including unset, counts as enabled.)
3. For each enabled platform, calls the relevant `initializeXxx()` method, which constructs the platform's client(s) and calls `handlers/<platform>/startup.js → bootstrap()`.
4. Registers `SIGTERM` / `SIGINT` handlers so `shutdown()` runs once on Ctrl-C or container stop.

### Discord command auto-loading

`handlers/discord/startup.js` reads every `.js` file in `commands/discord/` and stores it in a `Collection` keyed by `command.data.name`. A command file looks like:

```js
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mycommand")
    .setDescription("Does something")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client, clientManager) {
    await interaction.reply({ content: "Hello", ephemeral: true });
  },
};
```

After adding a new file, run `npm run generate-cmds` to push it to Discord — the auto-loader makes the bot _aware_ of the command, but Discord still needs the schema registered.

### Discord event auto-loading

`handlers/discord/startup.js` does the same scan for `events/discord/*.js`. Each file exports:

```js
module.exports = {
  name: "messageCreate", // any discord.js event
  once: false, // optional; default false
  async execute(message, client, clientManager) {
    /* ... */
  },
};
```

### Twitch and YouTube events (explicit wiring)

Twitch and YouTube **do not** auto-load. Their handlers are imported by name inside `handlers/twitch/startup.js` and `handlers/youtube/startup.js`. To add a new Twitch chat trigger, edit `events/twitch/messageCreate.js` (or add a new handler and import it from `handlers/twitch/startup.js`).

### Localization

`utils/language.js` resolves a Discord channel ID to a locale: anything matching `SPANISH_CHANNEL_ID` returns `es`, everything else returns `en`. Strings live in `lang/<topic>.js` keyed by locale. Greetings and dynamic response pools live in `data/resources.json` so they can be edited without redeploying.

To add a third language, add a new locale key to each file under `lang/`, add a matching block to `data/resources.json`, and extend `utils/language.js` with a new mapping.

### Image generation

`utils/imageGenerator.js` keeps a single Puppeteer browser instance alive (it relaunches on failure) and renders one of the HTML files in `templates/` to PNG. Templates use `{{BG_CLASS}}`, `{{LINK_TEXT}}` and other markers that the generator replaces dynamically depending on the current provider (YouTube or Twitch) before rendering. The `BANNER_SETTLE_MS` and `NEXT_STREAMS_SETTLE_MS` constants in `utils/constants.js` control how long the page is given to settle (load fonts, run animations) before the screenshot.

### Database

All DB access goes through Kysely. `db/database.js` declares the schema; the topical files (`db/greetings.js`, `db/warns.js`, `db/streams.js`) expose typed query helpers. All stream data (Twitch and YouTube) lives in the single `streams` table — the `provider` column distinguishes rows, and `getMostRecentStream(provider)` scopes queries per platform. To add a new table:

1. Add a `createTable(...)` block to `db/database.js → initialize()`.
2. Create a new `db/<name>.js` with the helpers.
3. Import and call those helpers from your event handlers.

There are no migrations — `ifNotExists()` means new tables are added on next boot, but **column additions to existing tables require a manual `ALTER TABLE`** against `data/galabot.sqlite`.

### YouTube polling state machine

State lives in `utils/youtubePoller.js` (`getState()` / `setState()`). The workflow queries `fetchAndCacheCategories()` to resolve category IDs to strings via `data/youtubeCategories.json`. 

The flow:

```text
unknown ──slow poll discovers upcoming/live──▶ upcoming
upcoming ──fast poll: isLive=true──▶ starting   (grace tick)
starting ──fast poll: isLive=true again──▶ live  (fires streamStart)
live ──fast poll: endTime present──▶ ended      (fires streamEnd)
```

The `starting` state exists to avoid false positives from a single flaky API response. On bot restart, checks the DB for an unfinished YouTube stream and restores state to `live` so we don't double-announce.

### Twitch token lifecycle

`utils/twitchToken.js → getValidTwitchConfig()` is called once during Twitch initialization. It reads `data/twitch.json`, refreshes the token if `LAST_REFRESH` is older than `TOKEN_VALIDITY_MS`, and writes the new tokens back. From there, `StaticAuthProvider` carries the token for the whole process lifetime — there's no in-process refresh loop, so very long-running bots should restart at least once every 59 days.

---

## Templates

The bot renders image attachments via headless Chromium. The templates live in `templates/`:

- `streamBanner.html`: Generated when a stream begins, replacing placeholders with title, category, and background images.
- `streamFollowup.html`: Attached to the embed when a stream ends if upcoming scheduled streams exist on the platform.
- `streamEnded.html`: Attached as a fallback if no upcoming streams are available at the end of a broadcast.

All templates dynamically apply a distinct color scheme and standard URLs based on the active provider (Twitch or YouTube).

---

## Common tasks (recipes)

| I want to…                                                | Edit                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Add a Discord slash command                               | Add a new file under `commands/discord/` exporting `{ data, execute }`, then run `npm run generate-cmds`. |
| Add a Discord chat behavior                               | Edit `events/discord/messageCreate.js` (or add a new handler — Discord auto-loads new files).             |
| Add a Twitch chat command                                 | Add a branch to `events/twitch/interactionCreate.js`.                                                     |
| Tune greeting cooldown / ban threshold / timeout duration | Edit constants in `utils/constants.js`.                                                                   |
| Tune Twitch viewer poll cadence                           | `VIEWER_POLL_INTERVAL_MS` in `utils/constants.js`.                                                        |
| Tune YouTube polling cadence                              | `YOUTUBE_FAST_POLL_MS` and `YOUTUBE_SLOW_POLL_MS` in `utils/constants.js` (mind the quota).               |
| Change the stream banner art                              | Edit `templates/streamBanner.html`. Re-run the bot — Puppeteer reloads the file each render.              |
| Disable a platform                                        | Set `ENABLE_DISCORD=false` / `ENABLE_TWITCH=false` / `ENABLE_YOUTUBE=false` in `.env`.                    |

---

## Database schema reference

The schema is created by `db/database.js` on first boot. The file lives at `data/galabot.sqlite`. All stream data — regardless of whether it came from Twitch or YouTube — is stored in the single `streams` table. The `provider` column (`'twitch'` | `'youtube'`) distinguishes rows.

`db/streams.js` exposes a provider-aware API:

| Function                                    | Purpose                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `insertStream(data)`                        | Insert a new stream row. `data.provider` is required.                                                                   |
| `getActiveStream(provider)`                 | Returns the current live stream (`end IS NULL`) for the given provider. Used by stream-end handlers and on-boot resume. |
| `getMostRecentStream(provider)`             | Returns the most recent stream regardless of end status. Use after `updateStreamEnd` to read back final data.           |
| `getStreamById(id)`                         | Fetch a specific stream row by ID.                                                                                      |
| `streamExists(id)`                          | Boolean existence check.                                                                                                |
| `updateStreamViewers(id, viewers)`          | Update the running viewer average.                                                                                      |
| `updateStreamEnd(id, endTime)`              | Set the end timestamp.                                                                                                  |
| `updateStreamDiscordMessage(id, discMsgId)` | Store the Discord notification message ID.                                                                              |

### `greetings`

Tracks when each user was last greeted (per-user cooldown).

| Column      | Type               | Purpose                      |
| ----------- | ------------------ | ---------------------------- |
| `id`        | integer (PK, auto) | Row ID.                      |
| `userId`    | text               | User ID (Discord or Twitch). |
| `timestamp` | datetime           | When the greeting fired.     |

### `warns`

One row per warning issued, used for the `/warn` escalation logic.

| Column      | Type               | Purpose                                               |
| ----------- | ------------------ | ----------------------------------------------------- |
| `id`        | integer (PK, auto) | Row ID.                                               |
| `userId`    | text               | Discord user ID.                                      |
| `timestamp` | datetime           | When the warn was issued.                             |
| `reason`    | text               | Free-form reason, capped at `MAX_WARN_REASON_LENGTH`. |

### `streams` (all providers)

| Column          | Type                      | Purpose                                                                   |
| --------------- | ------------------------- | ------------------------------------------------------------------------- |
| `id`            | text (PK)                 | Stream/video ID (Twitch stream ID or YouTube video ID).                   |
| `provider`      | text (default `'twitch'`) | Source platform: `'twitch'` or `'youtube'`.                               |
| `timestamp`     | datetime                  | Stream start time.                                                        |
| `title`         | text                      | Stream title.                                                             |
| `viewers`       | real                      | Running average of viewer samples.                                        |
| `viewerSamples` | integer (default 0)       | Number of samples taken.                                                  |
| `category`      | text (nullable)           | Game / category name. Twitch only; `NULL` for other providers.            |
| `tags`          | text (nullable)           | JSON-encoded array of tags. Twitch only; `NULL` for other providers.      |
| `thumbnail`     | text (nullable)           | Thumbnail URL. YouTube only; `NULL` for other providers.                  |
| `discMsgId`     | text (default `""`)       | Discord notification message ID — used to update the embed on stream end. |
| `end`           | datetime (nullable)       | Stream end time; `NULL` while the stream is live.                         |

---

## Operations & troubleshooting

### Log files

| File                | Contents                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| `logs/combined.log` | Everything from every logger.                                            |
| `logs/discord.log`  | Discord client events (login, command execution, embed posts).           |
| `logs/twitch.log`   | Twurple chat connect/disconnect, EventSub subscriptions, viewer polling. |
| `logs/youtube.log`  | Slow/fast poll outcomes and state transitions.                           |
| `logs/system.log`   | Startup, shutdown, fatal failures.                                       |
| `logs/db.log`       | Database operations.                                                     |

`docker compose logs -f bot` shows everything that hits stdout.

### Common failures

**`FATAL: Missing required environment variables: …`**
The required-vars list is `DISCORD_TOKEN`, `DISCORD_ID`, `GALA_DISCORD_ID`, `TWITCH_CHANNEL`, `TWITCH_USERNAME`, `DISCORD_NOTIFICATION_CHANNEL`, `POST_DATA_WEBHOOK`. Set the missing one in `.env` (or set the relevant `ENABLE_*=false` if you don't need that platform — but note that **Twitch vars are required even if Twitch is disabled** because they're in the unconditional REQUIRED_ENV list in `main.js`).

**Puppeteer can't find Chromium**
You'll see an error like `Failed to launch the browser process`. Set `PUPPETEER_EXECUTABLE_PATH` to your Chrome/Chromium binary, or use the Docker setup (which has it pre-installed).

**Twitch token expired / EventSub fails to subscribe**
Check `data/twitch.json` exists and has a valid `REFRESH_TOKEN`. If the refresh-token itself is dead, regenerate via twitchtokengenerator.com and overwrite the file. Restart the bot.

**YouTube quota exhausted**
You'll see 403s in `logs/youtube.log`. The bot pauses `search.list` for 24 h automatically. Set `YOUTUBE_API_KEY_2` to a key from a different Google Cloud project to fall back transparently.

**Slash commands aren't appearing in Discord**
Run `npm run generate-cmds`. Global slash commands can take a few minutes to propagate. Confirm the bot was invited with the `applications.commands` scope.

**The bot pings itself / loops on greetings**
The bot ignores its own user ID via `GALA_DISCORD_ID`. Make sure that var is the bot's user ID, not your user ID.

---

## Known gaps

- No automated tests. Verification is manual.
- Single-channel by design — monitoring multiple Twitch or YouTube channels would require generalizing `clientManager` and the state in `utils/youtubePoller.js`.
- No DB migrations — adding columns to existing tables requires a manual `ALTER TABLE`.
- Twitch tokens are loaded once per process; restart at least every ~59 days.

---

## License & credits

No `LICENSE` file is currently present in the repository. Treat the source as "all rights reserved" until one is added.

Built around the streamer **Gala** and her dinosaur mascot. Powered by [discord.js](https://discord.js.org/), [Twurple](https://twurple.js.org/), [Kysely](https://kysely.dev/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [Puppeteer](https://pptr.dev/), and [Winston](https://github.com/winstonjs/winston).
```
