Here is the full, updated `README.md` with all the corrupted encoding characters cleaned up, followed by a complete overview of the changes made to the project.

### `README.md`

````md
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
````

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
│
└── logs/                      Winston log output (created on first boot).
```

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

---

## License & credits

No `LICENSE` file is currently present in the repository. Treat the source as "all rights reserved" until one is added.

Built around the streamer **Gala** and her dinosaur mascot. Powered by [discord.js](https://discord.js.org/), [Twurple](https://twurple.js.org/), [Kysely](https://kysely.dev/), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [Puppeteer](https://pptr.dev/), and [Winston](https://github.com/winstonjs/winston).
