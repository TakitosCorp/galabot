/**
 * @module utils/types
 * @description
 * Centralised JSDoc `@typedef` definitions for cross-module shapes used across the bot.
 * This file exports nothing at runtime; it exists purely so other modules can reference
 * shared types via `@typedef {import('./utils/types').TypeName} TypeName`.
 *
 * Adding a new shared shape here keeps IDE intellisense consistent across files.
 */

"use strict";

/* ──────────────────────────── Logger types ──────────────────────────── */

/**
 * Winston log levels supported by the wrapper functions in {@link module:utils/loggers}.
 * @typedef {("error"|"warn"|"info"|"debug"|"verbose"|"silly")} LogLevel
 */

/**
 * Optional structured context object passed to a domain log function.
 * Serialized to JSON and appended to the log message for grep-friendly output.
 * @typedef {Object<string, unknown>} LogContext
 */

/**
 * Domain-scoped log function signature exposed by {@link module:utils/loggers}.
 * Backwards compatible: the third `context` argument is optional.
 * @callback DomainLogFn
 * @param {LogLevel} level - Severity level.
 * @param {string} message - Short human-readable message (use `module:action` style).
 * @param {LogContext} [context] - Optional structured context (ids, durations, error).
 * @returns {void}
 */

/* ──────────────────────────── Database row types ──────────────────────────── */

/**
 * Row shape for the `greetings` SQLite table — tracks the most recent greeting
 * sent to a given user across platforms.
 * @typedef {Object} GreetingRow
 * @property {number} id - Auto-increment primary key.
 * @property {string} userId - Discord or Twitch user id (string regardless of platform).
 * @property {string} timestamp - ISO-8601 timestamp of the greeting.
 */

/**
 * Row shape for the `warns` SQLite table — moderation warnings issued to a user.
 * @typedef {Object} WarnRow
 * @property {number} id - Auto-increment primary key.
 * @property {string} userId - Target user's Discord id.
 * @property {string} timestamp - ISO-8601 timestamp the warning was issued.
 * @property {string} reason - Free-text moderator reason (truncated by caller to MAX_WARN_REASON_LENGTH).
 */

/**
 * Row shape for the unified `streams` SQLite table — covers Twitch and YouTube live sessions.
 * @typedef {Object} StreamRow
 * @property {string} id - Provider-native stream/video id (Twitch stream id or YouTube videoId).
 * @property {("twitch"|"youtube")} provider - Originating platform.
 * @property {string} timestamp - ISO-8601 stream start time.
 * @property {string} title - Stream title at announcement time.
 * @property {number} viewers - Running viewer average (rolling mean).
 * @property {number} viewerSamples - Number of samples that fed into `viewers`.
 * @property {string|null} category - Twitch category/game name; NULL for YouTube.
 * @property {string|null} tags - JSON-stringified array of Twitch tags; NULL for YouTube.
 * @property {string|null} thumbnail - YouTube thumbnail URL; NULL for Twitch.
 * @property {string} discMsgId - Discord message id of the announcement embed (empty string if unsent).
 * @property {string|null} end - ISO-8601 stream end time, or NULL while live.
 */

/**
 * Payload accepted by {@link module:db/streams.insertStream}. Fields not stored on disk are ignored.
 * @typedef {Object} StreamInsert
 * @property {string} id
 * @property {("twitch"|"youtube")} provider
 * @property {string} timestamp
 * @property {string} title
 * @property {number} [viewers]
 * @property {string|null} [category]
 * @property {string|null} [tags]
 * @property {string|null} [thumbnail]
 * @property {string} [discMsgId]
 */

/* ──────────────────────────── Twitch types ──────────────────────────── */

/**
 * Persisted Twitch OAuth credentials read from `data/twitch.json`.
 * @typedef {Object} TwitchConfig
 * @property {string} ACCESS_TOKEN - User access token (Helix + chat scopes).
 * @property {string} REFRESH_TOKEN - Long-lived refresh token used to mint new access tokens.
 * @property {string} CLIENT_ID - Twitch application client id matching the token pair.
 * @property {string} VALID_UNTIL - ISO-8601 timestamp after which the token must be refreshed.
 */

/**
 * Normalized Twitch chat event passed to per-platform event handlers.
 * Built by {@link module:handlers/twitch/eventData.createEventData} from raw Twurple objects.
 * @typedef {Object} TwitchEventData
 * @property {string} channel - Twitch channel name (with or without `#`).
 * @property {{ name: string, id: string, displayName: string }} user - Sender identity.
 * @property {{ content: string, id: string, isCheer: boolean, bits: number, emotes: unknown }} message - Message payload.
 * @property {{ mod: boolean, broadcaster: boolean, subscriber: boolean, vip: boolean, founder: boolean, staff: boolean }} flags - Sender role flags.
 * @property {Date} timestamp - When the event was constructed.
 * @property {boolean} self - True when the message originates from the bot itself.
 * @property {unknown} rawData - Raw `@twurple/chat` userInfo for advanced consumers.
 */

/**
 * Stream banner / image generator input.
 * @typedef {Object} BannerData
 * @property {("twitch"|"youtube")} provider - Drives the colour palette and link text.
 * @property {string} title - Stream title (special command tokens like `!foo` are stripped).
 * @property {string} category - Game/category label.
 * @property {string} image - Absolute URL to the box-art / thumbnail image.
 */

/**
 * Streamer schedule entry returned by {@link module:utils/twitchSchedule.getStreamerScheduleThisWeek}.
 * @typedef {Object} ScheduleSegment
 * @property {string} title - Segment title.
 * @property {string} category - Game/category name; "Sin categoría" when unset.
 * @property {string} start - ISO-8601 segment start.
 * @property {string} end - ISO-8601 segment end.
 * @property {string|null} gameBoxArtUrl - Pre-resolved box-art URL or null when unavailable.
 */

/* ──────────────────────────── YouTube types ──────────────────────────── */

/**
 * Mutable in-memory state managed by {@link module:utils/youtubePoller}.
 * @typedef {Object} YouTubeState
 * @property {string|null} videoId - Tracked YouTube videoId, or null when idle.
 * @property {string|null} title - Tracked stream title.
 * @property {string|null} thumbnail - Tracked stream thumbnail URL.
 * @property {string|null} scheduledStart - ISO-8601 scheduled or actual start time.
 * @property {string|null} streamUrl - Public watch URL.
 * @property {string|null} category - Resolved category name, or null when not yet known.
 * @property {("unknown"|"upcoming"|"starting"|"live"|"ended")} status - State-machine label.
 * @property {boolean} embedSent - True after a Discord announcement embed has been posted for the current video.
 * @property {boolean} isPolling - Re-entrancy lock for `updateWorkflow`.
 * @property {number} quotaExhaustedUntil - Epoch ms after which API calls may resume.
 * @property {boolean} usingFallbackKey - True once we've rotated to YOUTUBE_API_KEY_2.
 */

/**
 * Compact stream descriptor extracted from raw YouTube API responses.
 * @typedef {Object} YouTubeStreamData
 * @property {string} videoId
 * @property {string} title
 * @property {string|null} thumbnail
 * @property {string} scheduledStart - ISO-8601 actual or scheduled start.
 * @property {string} streamUrl
 * @property {string} category - Resolved category name (falls back to "YouTube Live").
 */

/**
 * Result of one fast-poll tick — drives the live/ended decisioning in
 * {@link module:handlers/youtube/startup.runFastPoll}.
 * @typedef {Object} YouTubeCheckResult
 * @property {boolean} isLive
 * @property {number} viewers
 * @property {string|null} endTime - ISO-8601 actualEndTime when the stream has ended.
 */

/* ──────────────────────────── Discord handler types ──────────────────────────── */

/**
 * Standard discord.js event handler module shape used by the auto-loader in
 * {@link module:handlers/discord/startup}.
 * @typedef {Object} DiscordEventHandler
 * @property {string} name - discord.js Events.* event name.
 * @property {boolean} [once] - When true, registered with `client.once`.
 * @property {(...args: any[]) => Promise<void>} execute - Handler implementation.
 */

/**
 * Discord slash command module shape, consumed by `discordClient.commands`.
 * @typedef {Object} DiscordSlashCommand
 * @property {import('discord.js').SlashCommandBuilder} data - Builder describing options/permissions.
 * @property {(interaction: import('discord.js').ChatInputCommandInteraction, client: import('discord.js').Client, clientManager: import('../clientManager')) => Promise<void>} execute
 */

// Intentionally empty runtime export — this module is types-only.
module.exports = {};
