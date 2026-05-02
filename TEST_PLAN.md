# GalaBot Test Plan

This document outlines a comprehensive testing strategy for GalaBot across all platforms (Discord, Twitch, YouTube) and features.

---

## Test Environment Setup

### Prerequisites
- Node.js 22+ installed locally
- Discord bot with intents: `Guilds`, `Guild Messages`, `Message Content`
- Twitch bot account with OAuth token (chat:read, chat:edit scopes)
- YouTube API key with YouTube Data API v3 enabled
- Chromium/Chrome browser installed
- Test Discord server with test channels and roles
- Test Twitch account and channel
- Test YouTube channel with ability to stream

### Configuration
- Copy `.env.example` to `.env.test` with test credentials
- Create separate test database: `data/galabot-test.sqlite`
- Use test Discord server ID, channel IDs, and role IDs
- Use test Twitch channel name and bot account
- Use test YouTube channel ID and API key

---

## 1. Discord Integration Tests

### 1.1 Bot Startup & Connection
- [ ] Bot connects successfully with valid `DISCORD_TOKEN`
- [ ] Bot reports ready status: `Discord client connected as <bot-tag>` in logs
- [ ] Bot appears online in Discord server
- [ ] Bot exits with FATAL error if `DISCORD_TOKEN` is missing
- [ ] Bot exits with FATAL error if `DISCORD_ID` is missing
- [ ] Bot can be toggled off via `ENABLE_DISCORD=false`

### 1.2 Slash Commands

#### `/rules` Command
- [ ] Command appears in Discord slash menu
- [ ] `/rules` without user parameter posts full rules embed in channel
- [ ] Embed includes rule fields with proper formatting
- [ ] `/rules @user` DMs the user with rules reminder
- [ ] DM fallback: if user DMs disabled, posts reminder in the invoked channel instead
- [ ] Only users with `ManageMessages` permission can use the command
- [ ] Command fails gracefully if notification channel is invalid

#### `/warn` Command
- [ ] Command appears in Discord slash menu
- [ ] `/warn @user <reason>` applies warning and 10-min timeout
- [ ] Warning is stored in database with user ID, timestamp, and reason
- [ ] Second warn on same user: 20-min timeout
- [ ] Third warn on same user: permanent ban
- [ ] Warn limit is 3 (configurable in `utils/constants.js`)
- [ ] Timeout base is 10 minutes (configurable in `utils/constants.js`)
- [ ] User receives DM notification of warning (or channel fallback)
- [ ] Only users with `ManageMessages` permission can use the command
- [ ] Bot fails gracefully if missing `ModerateMembers` or `BanMembers` permissions
- [ ] Reason is capped at 512 characters (configurable in `utils/constants.js`)

### 1.3 Message Events

#### Greetings
- [ ] Bot responds to greeting keywords: "hi", "hello", "hey", "heya", "hola", "ola" (case-insensitive)
- [ ] Greeting response is a random entry from `data/resources.json` greeting pool
- [ ] Greeting cooldown is 4 hours per user (configurable in `utils/constants.js`)
- [ ] User cannot trigger another greeting within cooldown window
- [ ] Greetings work in `SPANISH_CHANNEL_ID` (Spanish responses)
- [ ] Greetings work in other channels (English responses)
- [ ] Cooldown is shared between Discord and Twitch
- [ ] Database logs greeting with user ID and timestamp

#### Bot Ping Auto-Warn
- [ ] Pinging the bot (`@GalaBot`) triggers automatic warning
- [ ] Warning is logged to database
- [ ] User receives DM or channel notification
- [ ] Auto-warn escalates same as `/warn` command (1st → timeout, 3rd → ban)
- [ ] Bot does not warn itself (`GALA_DISCORD_ID` check works)
- [ ] Bot does not warn other bots

### 1.4 Stream Notifications (Discord)

#### Twitch Stream Start
- [ ] When Twitch stream goes live, Discord embed is posted to `DISCORD_NOTIFICATION_CHANNEL`
- [ ] Embed includes: title, category, tags, custom banner image
- [ ] Embed color is purple (0x800080)
- [ ] Embed includes "Watch stream" button linking to Twitch
- [ ] Role mention appears if `DISCORD_NOTIFICATION_ROLE_ID` is set
- [ ] Discord message ID is stored in database for later update
- [ ] Stream metadata (title, category, tags) is stored in `streams` table
- [ ] `provider` field is set to `'twitch'`

#### Twitch Stream End
- [ ] When Twitch stream goes offline, Discord embed is updated (not replaced)
- [ ] Updated embed shows: title, category, status ("stream has ended")
- [ ] "Watch stream" button is removed
- [ ] Next streams image is attached if schedule exists
- [ ] Final viewer average is displayed
- [ ] Stream marked as ended in database (`end` timestamp set)
- [ ] Webhook POST sent to `POST_DATA_WEBHOOK` with final stream data
- [ ] Webhook payload includes: id, provider, timestamp, title, viewers, category, tags, end

#### YouTube Stream Start
- [ ] When YouTube stream goes live, Discord embed is posted to `DISCORD_NOTIFICATION_CHANNEL`
- [ ] Embed includes: title, stream link, custom banner image
- [ ] Embed color is red (0xff0000)
- [ ] Embed includes "Watch stream" button linking to YouTube
- [ ] Role mention appears if `DISCORD_NOTIFICATION_ROLE_ID` is set
- [ ] Stream metadata is stored in `streams` table
- [ ] `provider` field is set to `'youtube'`
- [ ] `thumbnail` field is populated
- [ ] `category` and `tags` fields are NULL

#### YouTube Stream End
- [ ] When YouTube stream ends, Discord embed is updated
- [ ] Updated embed shows: title, status, average viewers
- [ ] Webhook POST sent with final stream data
- [ ] Webhook payload includes: id, provider, timestamp, title, viewers, thumbnail, end

### 1.5 Permission & Safety Tests
- [ ] Bot cannot warn users with higher roles than itself
- [ ] Bot cannot ban/timeout users without proper permissions
- [ ] Commands fail gracefully with permission error messages
- [ ] Bot mentions it needs permissions in error logs

---

## 2. Twitch Integration Tests

### 2.1 Bot Startup & Connection
- [ ] Bot connects to Twitch chat as `TWITCH_USERNAME`
- [ ] Connection log: `Twitch chat client connected as <username>`
- [ ] Bot joins `TWITCH_CHANNEL` successfully
- [ ] EventSub listener subscribes to stream.online / stream.offline
- [ ] Bot exits with FATAL error if `TWITCH_CHANNEL` is missing
- [ ] Bot exits with FATAL error if `TWITCH_USERNAME` is missing
- [ ] Bot can be toggled off via `ENABLE_TWITCH=false`

### 2.2 Token Management
- [ ] On first run, bot reads token from `data/twitch.json`
- [ ] If token is expired, bot refreshes via twitchtokengenerator.com
- [ ] Refreshed token is written back to `data/twitch.json`
- [ ] `LAST_REFRESH` timestamp is updated
- [ ] Token validity period is 59 days (configurable in `utils/constants.js`)
- [ ] Bot continues to use the same token for up to 59 days without re-refreshing

### 2.3 Chat Messages

#### Greetings
- [ ] Bot responds to greeting keywords in chat
- [ ] Response is a random greeting from `data/resources.json`
- [ ] Greeting cooldown is 4 hours per user (shared with Discord)
- [ ] User cannot spam greetings within cooldown

#### Chat Commands
- [ ] `!ping` command triggers response: "Pong!"
- [ ] `g!ping` command (alternate prefix) also triggers response
- [ ] Commands are case-insensitive
- [ ] Commands work in the streamer's chat

### 2.4 Stream Events

#### Stream Start (EventSub)
- [ ] When stream goes online, `streamStart` handler fires immediately
- [ ] Stream metadata is fetched: title, category, game info
- [ ] Game box art is fetched from Twitch API
- [ ] Custom banner image is generated with Puppeteer
- [ ] Discord notification is posted (see Discord tests)
- [ ] Stream is stored in database with `provider: 'twitch'`
- [ ] Viewer polling loop starts (samples every 60 seconds)
- [ ] EventSub log: `EventSub subscribed to events for <channel>`

#### Viewer Polling
- [ ] Viewer count is sampled every 60 seconds during stream (configurable)
- [ ] Running average is calculated: `new_avg = (old_avg * samples + current) / (samples + 1)`
- [ ] Average is rounded to nearest integer
- [ ] Database stores rolling average and sample count
- [ ] Polling stops when stream ends

#### Stream End (EventSub)
- [ ] When stream goes offline, `streamEnd` handler fires
- [ ] Viewer polling loop stops
- [ ] Next scheduled streams image is generated (if schedule exists)
- [ ] Discord notification is updated with final stats
- [ ] Stream is marked as ended in database
- [ ] Webhook POST is sent with final data (see Discord tests)
- [ ] EventSub log: `EventSub stream offline detected`

### 2.5 Schedule Fetching
- [ ] On stream end, bot fetches Twitch schedule via Helix API
- [ ] If schedule exists, next streams image is generated and attached to Discord embed
- [ ] If no schedule exists (404), graceful fallback with empty schedule
- [ ] Schedule image shows next 7 days of streams
- [ ] Image is generated via Puppeteer from HTML template

---

## 3. YouTube Integration Tests

### 3.1 Bot Startup & Connection
- [ ] Bot initializes YouTube poller on startup
- [ ] Slow poll runs first (updateWorkflow)
- [ ] Fast poll runs immediately after slow poll (checkWorkflow)
- [ ] Both poll intervals are registered in `clientManager.youtubeIntervals`
- [ ] Bot exits with FATAL error if `YOUTUBE_CHANNEL_ID` is missing
- [ ] Bot exits with FATAL error if `YOUTUBE_API_KEY` is missing
- [ ] Bot can be toggled off via `ENABLE_YOUTUBE=false`
- [ ] Bot can resume tracking after restart if stream is still live

### 3.2 Polling System

#### Slow Poll (Search)
- [ ] Runs every 3 hours (configurable `YOUTUBE_SLOW_POLL_MS`)
- [ ] Uses `search.list` (100 quota units per call)
- [ ] Searches for videos in `YOUTUBE_CHANNEL_ID` with status: upcoming or live
- [ ] Updates polling state when video is discovered
- [ ] Log: `Slow poll complete. Tracking: "<title>" (<videoId>) — status: <status>`
- [ ] On quota exhaustion (403), pauses search.list for 24 hours (configurable)
- [ ] Falls back to `YOUTUBE_API_KEY_2` if primary key is exhausted

#### Fast Poll (Videos)
- [ ] Runs every 1 minute (configurable `YOUTUBE_FAST_POLL_MS`)
- [ ] Uses `videos.list` (1 quota unit per call)
- [ ] Detects state transitions: upcoming → starting → live → ended
- [ ] Grace period on "starting" state: waits until next tick to confirm
- [ ] Logs state: `Stream appears to be starting (grace period). Will confirm on next tick.`
- [ ] On confirmation: `Stream confirmed live. Triggering streamStart handler.`
- [ ] Detects stream end via `endTime` field
- [ ] Updates viewer count if available during live stream

#### State Machine
- [ ] Video discovered in slow poll: status = "unknown"
- [ ] Fast poll detects `isLive=true`: status = "starting" (grace period)
- [ ] Fast poll confirms again: status = "live" (fires streamStart)
- [ ] Fast poll detects `endTime`: status = "ended" (fires streamEnd)
- [ ] On bot restart: resumes tracking if stream is live (`end IS NULL`)

### 3.3 Quota Management
- [ ] Default quota: 10,000 units/day
- [ ] Slow poll: ~800 units/day (8 calls × 100 units)
- [ ] Fast poll: ~1,440 units/day (1,440 calls × 1 unit)
- [ ] Total: ~2,240 units/day (safe margin)
- [ ] Quota exhaustion is logged and handled gracefully
- [ ] Fallback API key is used if primary key is exhausted
- [ ] Quota cooldown is 24 hours (configurable)

### 3.4 Stream Events

#### Stream Start
- [ ] Polling detects live status and fires handler
- [ ] Stream metadata is fetched
- [ ] Custom YouTube banner image is generated
- [ ] Discord notification is posted with red embed (0xff0000)
- [ ] Stream is stored in database with `provider: 'youtube'`
- [ ] `thumbnail` field is populated
- [ ] Fast poll continues to sample viewer count

#### Stream End
- [ ] Polling detects `endTime` and fires handler
- [ ] Discord notification is updated with end status
- [ ] Average viewer count is displayed
- [ ] Stream is marked as ended in database
- [ ] Webhook POST is sent with final data
- [ ] Polling state is reset

---

## 4. Database Tests

### 4.1 Schema Creation
- [ ] On first boot, all tables are created if not exist:
  - [ ] `greetings`
  - [ ] `warns`
  - [ ] `streams` (unified for all providers)
- [ ] No errors on subsequent boots (idempotent schema)

### 4.2 Streams Table
- [ ] Insert Twitch stream: `provider='twitch'`, category/tags populated, thumbnail=NULL
- [ ] Insert YouTube stream: `provider='youtube'`, category/tags=NULL, thumbnail populated
- [ ] Query by provider filters correctly: `getActiveStream('twitch')` vs `getActiveStream('youtube')`
- [ ] Active stream query (end IS NULL) returns only live streams
- [ ] Most recent stream query returns stream regardless of end status
- [ ] Stream ID lookup works via `getStreamById(id)`
- [ ] Viewer average is calculated and rounded correctly
- [ ] Sample count increments on each update
- [ ] End timestamp is set on stream end
- [ ] Discord message ID is stored and retrievable

### 4.3 Greetings Table
- [ ] Greeting is logged with user ID and timestamp
- [ ] Cooldown check queries by user ID
- [ ] Same user ID cannot greet again within cooldown window
- [ ] Different users can greet independently

### 4.4 Warns Table
- [ ] Warn is logged with user ID, timestamp, and reason
- [ ] Warning count is calculated correctly
- [ ] Third warn triggers ban logic
- [ ] Warns are persisted and retrievable

---

## 5. Image Generation Tests

### 5.1 Puppeteer Setup
- [ ] Chromium/Chrome is found at `PUPPETEER_EXECUTABLE_PATH`
- [ ] Browser is launched on first use
- [ ] Browser is reused across multiple renders
- [ ] Browser relaunches if it crashes
- [ ] Browser is properly closed on shutdown

### 5.2 Stream Banner (Twitch)
- [ ] Banner template (`templates/streamBanner.html`) is rendered
- [ ] Placeholders are replaced: `{{STREAM_TITLE}}`, `{{STREAM_CATEGORY}}`, `{{GAME_BOX_ART_URL}}`
- [ ] Game box art is fetched and rendered (if available)
- [ ] Image is generated as PNG buffer
- [ ] Image dimensions are correct
- [ ] Image is attached to Discord embed with name "stream-banner.png"

### 5.3 Stream Banner (YouTube)
- [ ] Banner template (`templates/youtubeStreamBanner.html`) is rendered
- [ ] Placeholders are replaced: `{{STREAM_TITLE}}`, `{{THUMBNAIL_URL}}`
- [ ] YouTube thumbnail is used as fallback if banner fails
- [ ] Image is generated as PNG buffer
- [ ] Image is attached to Discord embed with name "stream-banner.png"

### 5.4 Next Streams Image (Twitch)
- [ ] Template (`templates/nextStreams.html`) is rendered with schedule data
- [ ] Upcoming streams are displayed (next 7 days)
- [ ] Image shows stream titles, times, and categories
- [ ] Image is generated as PNG buffer
- [ ] Image is attached to Discord embed with name "next-streams.png"
- [ ] Gracefully handles empty schedule (no crashes)

### 5.5 Error Handling
- [ ] If Puppeteer fails, fallback to standard Discord thumbnails
- [ ] Error is logged but does not crash the bot
- [ ] Discord notification is still posted even if banner generation fails

---

## 6. Localization Tests

### 6.1 Language Detection
- [ ] Channel ID matches `SPANISH_CHANNEL_ID`: Spanish responses used
- [ ] Channel ID does not match: English responses used
- [ ] Language resolution works for all features: greetings, commands, messages

### 6.2 Spanish Language
- [ ] Greeting responses include Spanish variants (from `lang/` files)
- [ ] Command help text is available in Spanish
- [ ] Stream notifications use correct language
- [ ] Error messages are localized

### 6.3 English Language
- [ ] All responses default to English if language is not Spanish
- [ ] All features have English variants

---

## 7. Webhook Tests

### 7.1 POST_DATA_WEBHOOK
- [ ] Webhook URL is configured in `.env`
- [ ] POST request is sent when Twitch stream ends
- [ ] POST request is sent when YouTube stream ends
- [ ] Payload includes all required fields:
  - [ ] `id` (stream ID)
  - [ ] `provider` ('twitch' or 'youtube')
  - [ ] `timestamp` (ISO 8601 start time)
  - [ ] `title` (stream title)
  - [ ] `viewers` (average viewer count)
  - [ ] `category` (Twitch only, null for YouTube)
  - [ ] `tags` (Twitch only, null for YouTube)
  - [ ] `thumbnail` (YouTube only, null for Twitch)
  - [ ] `end` (ISO 8601 end time)
- [ ] HTTP 200+ response is considered success
- [ ] Webhook timeout/failure is logged but does not crash bot
- [ ] Placeholder webhook URL (e.g., `https://example.com/noop`) does not crash

---

## 8. Logging Tests

### 8.1 Log Files
- [ ] All logs are written to `logs/` directory
- [ ] Log files exist for each platform:
  - [ ] `logs/discord.log`
  - [ ] `logs/twitch.log`
  - [ ] `logs/youtube.log`
  - [ ] `logs/system.log`
  - [ ] `logs/db.log`
  - [ ] `logs/combined.log`
- [ ] Each log includes timestamp, level, message
- [ ] Format: `[ISO-8601-timestamp] [Platform] level: message`

### 8.2 Log Levels
- [ ] `info` level: normal operations (stream start, reconnect, etc.)
- [ ] `warn` level: recoverable issues (missing schedule, DM fallback, etc.)
- [ ] `error` level: failures (API errors, missing permissions, etc.)

### 8.3 Console Output
- [ ] Logs also appear on stdout in real-time
- [ ] No sensitive information (tokens, IDs) in logs

---

## 9. Configuration Tests

### 9.1 Environment Variables
- [ ] Bot exits with FATAL if required vars are missing:
  - [ ] `DISCORD_TOKEN`
  - [ ] `DISCORD_ID`
  - [ ] `GALA_DISCORD_ID`
  - [ ] `TWITCH_CHANNEL`
  - [ ] `TWITCH_USERNAME`
  - [ ] `DISCORD_NOTIFICATION_CHANNEL`
  - [ ] `POST_DATA_WEBHOOK`
- [ ] Optional vars use sensible defaults:
  - [ ] `ENABLE_DISCORD` defaults to true
  - [ ] `ENABLE_TWITCH` defaults to true
  - [ ] `ENABLE_YOUTUBE` defaults to true (if YOUTUBE_CHANNEL_ID set)
- [ ] Platform can be disabled via env var without crashing

### 9.2 Constants
- [ ] Greeting cooldown: 4 hours (tunable in `utils/constants.js`)
- [ ] Warn timeout base: 10 minutes (tunable)
- [ ] Ban threshold: 3 warns (tunable)
- [ ] Viewer poll interval: 60 seconds (tunable)
- [ ] YouTube slow poll: 3 hours (tunable)
- [ ] YouTube fast poll: 1 minute (tunable)
- [ ] Changes to constants apply on next bot restart

---

## 10. Graceful Shutdown Tests

### 10.1 Signal Handling
- [ ] Bot receives `SIGTERM` signal and initiates shutdown
- [ ] Bot receives `SIGINT` (Ctrl-C) signal and initiates shutdown
- [ ] Log: `Received SIGTERM. Shutting down gracefully…`

### 10.2 Cleanup Sequence
- [ ] Viewer polling intervals are stopped
- [ ] Puppeteer browser is closed
- [ ] YouTube polling intervals are cleared
- [ ] Discord client is destroyed
- [ ] Twitch chat client is quit
- [ ] EventSub listener is stopped
- [ ] Log: `Shutdown complete.`
- [ ] Process exits with code 0

### 10.3 In-Progress Operations
- [ ] If stream is ending during shutdown, webhook is still sent (if possible)
- [ ] No data loss or corruption on shutdown

---

## 11. Error Recovery Tests

### 11.1 Network Failures
- [ ] Discord reconnects on connection loss
- [ ] Twitch chat auto-reconnects on disconnect
- [ ] YouTube polling continues through transient API errors
- [ ] API errors are logged but do not crash bot

### 11.2 Missing Permissions
- [ ] Bot logs error if it cannot edit Discord message (missing permissions)
- [ ] Bot logs error if it cannot apply timeout (missing permissions)
- [ ] Operations continue gracefully without permissions

### 11.3 Invalid Configuration
- [ ] Invalid Discord channel ID is caught and logged
- [ ] Invalid Twitch channel name is caught and logged
- [ ] Invalid YouTube channel ID is caught and logged
- [ ] Bot does not crash on invalid config (where possible)

---

## 12. Integration Tests (Cross-Platform)

### 12.1 Simultaneous Events
- [ ] Twitch stream end and Discord command execute simultaneously: both succeed
- [ ] YouTube poll fires while Twitch message handler is active: no race conditions
- [ ] Greeting cooldown is respected across Discord and Twitch simultaneously

### 12.2 State Consistency
- [ ] Database reflects correct state after multi-platform events
- [ ] Viewer averages are correct if events overlap

---

## Manual Testing Checklist

### Pre-Test
- [ ] Database is clean: `data/galabot-test.sqlite` is fresh
- [ ] All credentials are valid and have required permissions
- [ ] Discord server is set up with test channel and roles
- [ ] Twitch bot account is connected
- [ ] YouTube channel has no active streams

### Execution
- [ ] Run bot in test environment: `npm start` with `.env.test`
- [ ] Monitor logs in real-time: `tail -f logs/combined.log`
- [ ] Execute each test case manually
- [ ] Record results (pass/fail) for each test

### Post-Test
- [ ] Review all log files for errors
- [ ] Verify database state with SQLite viewer
- [ ] Clean up test data (warns, greetings, streams)
- [ ] Stop bot gracefully with Ctrl-C

---

## Automated Testing (Future)

When automated tests are added, they should cover:
- [ ] All database CRUD operations
- [ ] All Discord commands (mocked)
- [ ] All Twitch chat handlers (mocked)
- [ ] All YouTube polling logic (mocked API)
- [ ] Image generation (mocked Puppeteer)
- [ ] Graceful shutdown
- [ ] Error handling

---

## Test Results Template

```
Date: YYYY-MM-DD
Tester: <Name>
Bot Version: <Git commit>
Environment: <Docker/Local>

DISCORD: [ ] PASS [ ] FAIL
- [ ] Startup
- [ ] /rules command
- [ ] /warn command
- [ ] Greetings
- [ ] Bot ping auto-warn
- [ ] Twitch notifications
- [ ] YouTube notifications

TWITCH: [ ] PASS [ ] FAIL
- [ ] Startup
- [ ] Chat greetings
- [ ] Chat commands
- [ ] Stream start
- [ ] Viewer polling
- [ ] Stream end

YOUTUBE: [ ] PASS [ ] FAIL
- [ ] Startup
- [ ] Slow poll
- [ ] Fast poll
- [ ] Stream detection
- [ ] Stream end

DATABASE: [ ] PASS [ ] FAIL
- [ ] Schema creation
- [ ] Stream storage
- [ ] Greeting cooldown
- [ ] Warns tracking

IMAGE GENERATION: [ ] PASS [ ] FAIL
- [ ] Stream banners
- [ ] Next streams image
- [ ] Fallback handling

LOCALIZATION: [ ] PASS [ ] FAIL
- [ ] Spanish responses
- [ ] English responses

WEBHOOK: [ ] PASS [ ] FAIL
- [ ] Twitch end payload
- [ ] YouTube end payload

LOGGING: [ ] PASS [ ] FAIL
- [ ] Log files created
- [ ] Console output

SHUTDOWN: [ ] PASS [ ] FAIL
- [ ] Graceful shutdown
- [ ] Signal handling

NOTES:
<Any issues or observations>
```

---

## Known Limitations

- No automated test suite yet (manual testing only)
- Single-channel design limits concurrent stream testing
- YouTube API quotas limit extended testing
- Requires real credentials; cannot mock external services completely

---

## Future Improvements

- Add Jest/Vitest test suite for unit tests
- Mock Discord.js, Twurple, and YouTube API for integration tests
- Add CI/CD pipeline to run tests on each commit
- Add performance benchmarks for image generation
- Add load testing for high-concurrency scenarios
