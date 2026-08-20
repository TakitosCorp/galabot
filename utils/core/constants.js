/**
 * @module utils/constants
 * @description
 * Single source of truth for tunable timing/threshold values used across the bot.
 * Keep magic numbers here — never hard-code durations or limits at call sites.
 */

/**
 * Minimum delay between two greetings sent to the same user (across platforms).
 * Prevents spam when a user posts repeated greetings in quick succession.
 * @type {number}
 * @constant
 */
export const GREETING_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Base timeout duration applied per accumulated warning. The actual timeout is
 * `warnCount * WARN_TIMEOUT_BASE_MS`, so the punishment scales linearly.
 * @type {number}
 * @constant
 */
export const WARN_TIMEOUT_BASE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Number of accumulated warnings that triggers a permanent ban instead of a timeout.
 * @type {number}
 * @constant
 */
export const MAX_WARN_BEFORE_BAN = 3;

/**
 * Hard cap on the length of a moderator-supplied warning reason. Anything longer
 * is rejected up-front so the value fits comfortably in the SQLite TEXT column
 * and Discord embed fields.
 * @type {number}
 * @constant
 */
export const MAX_WARN_REASON_LENGTH = 512;

/**
 * Default number of days of messages to delete when the `/ban` command is used
 * without an explicit `delete_days` option. Maps to Discord's
 * `deleteMessageSeconds` (value × 86 400). Maximum allowed by Discord is 7.
 * @type {number}
 * @constant
 */
export const BAN_DELETE_DAYS_DEFAULT = 7;

/**
 * Lifetime of a freshly-minted Twitch access token before we proactively refresh it.
 * Set just under Twitch's 60-day refresh-token rotation window.
 * @type {number}
 * @constant
 */
export const TOKEN_VALIDITY_MS = 59 * 24 * 60 * 60 * 1000; // 59 days

/**
 * How often the live-viewer poller samples a Twitch stream's concurrent viewer count
 * to update the rolling average stored on the stream row.
 * @type {number}
 * @constant
 */
export const VIEWER_POLL_INTERVAL_MS = 60 * 1000; // 60 s

/**
 * Default Puppeteer page-level timeout (`page.setDefaultTimeout`) for image generation.
 * @type {number}
 * @constant
 */
export const PUPPETEER_PAGE_TIMEOUT_MS = 45_000;

/**
 * Per-`page.goto` timeout when loading the data-URI HTML template.
 * @type {number}
 * @constant
 */
export const PUPPETEER_GOTO_TIMEOUT_MS = 15_000;

/**
 * Per-`page.screenshot` timeout. Kept small because the page is already settled.
 * @type {number}
 * @constant
 */
export const PUPPETEER_SCREENSHOT_TIMEOUT_MS = 5_000;

/**
 * Per-`page.waitForSelector` timeout for templates that need a specific node to appear
 * before snapshotting.
 * @type {number}
 * @constant
 */
export const PUPPETEER_SELECTOR_TIMEOUT_MS = 5_000;

/**
 * Extra settle delay after the "next streams" follow-up template finishes loading.
 * Gives lazy-loaded box-art images a chance to paint.
 * @type {number}
 * @constant
 */
export const NEXT_STREAMS_SETTLE_MS = 800;

/**
 * Settle delay used by the live-stream banner and ended templates.
 * @type {number}
 * @constant
 */
export const BANNER_SETTLE_MS = 500;

/**
 * Cadence of the YouTube fast poll — checks the currently-tracked video for live state
 * and viewer counts.
 * @type {number}
 * @constant
 */
export const YOUTUBE_FAST_POLL_MS = 60 * 1000; // 60 s

/**
 * Cadence of the YouTube slow poll — searches the channel for new upcoming/live streams.
 * Spaced widely to keep daily quota usage low.
 * @type {number}
 * @constant
 */
export const YOUTUBE_SLOW_POLL_MS = 3 * 60 * 60 * 1000; // 3 h

/**
 * Cadence of the YouTube category cache refresh (regional category list rarely changes).
 * @type {number}
 * @constant
 */
export const YOUTUBE_CATEGORY_POLL_MS = 48 * 60 * 60 * 1000; // 48 h

/**
 * Maximum age (in hours) at which a scheduled YouTube stream is still considered worth
 * tracking. Prevents resurrected/abandoned stream entries from polluting state.
 * @type {number}
 * @constant
 */
export const YOUTUBE_STREAM_VALID_HOURS = 12;

/**
 * Cooldown applied after a YouTube quotaExceeded response — suppresses further API calls
 * until the daily quota window resets.
 * @type {number}
 * @constant
 */
export const YOUTUBE_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Maximum retry attempts for a single YouTube request. Backoff is `2^attempt * 1000` ms.
 * @type {number}
 * @constant
 */
export const YOUTUBE_RETRY_MAX = 3;

/**
 * Minimum delay between two AI requests from the same user. Users who ping
 * the bot again before this elapses get a "slow down" reply instead of being
 * queued. Bypassed for ids in `GEMINI_NO_LIMITS_IDS`.
 * @type {number}
 * @constant
 */
export const AI_USER_COOLDOWN_MS = 5 * 1000; // 5 seconds

/**
 * Hard cap on AI requests we will dispatch to Gemini per rolling minute.
 * Set to match the free-tier `gemma-4-*` 15 RPM ceiling. Bump to 30 if you
 * switch `GEMINI_MODEL` to a `gemma-3-*` variant (14,400 RPD / 30 RPM tier).
 * The queue worker pauses (does not drop) requests that would exceed this —
 * the message stays queued until a slot frees up.
 * @type {number}
 * @constant
 */
export const AI_GLOBAL_RPM_LIMIT = 15;

/**
 * Sliding-window duration used by `AI_GLOBAL_RPM_LIMIT`.
 * @type {number}
 * @constant
 */
export const AI_GLOBAL_RPM_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Cooldown applied after Gemini returns a 429 (RPM/RPD exhausted) on every
 * configured key. While in cooldown the bot fails AI replies silently
 * (warn-level log, no reply to user) instead of hammering the API. One hour
 * is a pragmatic middle ground: short enough to recover automatically once
 * RPD resets at midnight UTC, long enough not to retry every minute.
 * @type {number}
 * @constant
 */
export const GEMINI_QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
