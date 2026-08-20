/**
 * @module main
 * @description
 * Entry point. Loads `.env`, validates that every required environment variable
 * is present, then constructs and initializes a {@link module:clientManager} which
 * owns all platform clients (Discord, Twitch, YouTube). A failure during init logs
 * a fatal error and terminates the process with a non-zero exit code.
 */

import dotenv from "dotenv";
import ClientManager from "./handlers/clientManager.js";
import { sysLog } from "./utils/core/loggers.js";

dotenv.config({ quiet: true });

/**
 * Environment variables that must be set for the bot to start. Optional settings
 * (`ENABLE_DISCORD`, `ENABLE_TWITCH`, `ENABLE_YOUTUBE`, `SPANISH_CHANNEL_ID`,
 * `YOUTUBE_API_KEY*`, `YOUTUBE_CHANNEL_ID`, `DISCORD_NOTIFICATION_ROLE_ID`,
 * `PUPPETEER_EXECUTABLE_PATH`, `YOUTUBE_SKIP_TITLES`,
 * `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_ENABLE`, `GEMINI_NO_LIMITS_IDS`, `GEMINI_WHITELIST_ONLY`) are
 * intentionally absent — the features they control degrade gracefully when the
 * variables are missing.
 *
 * `GALA_USER_ID` is the personal Discord user id of the streamer whose
 * @-mentions trigger the warn/ban escalation. `GALA_DISCORD_ID` is the
 * guild/server id (used by the emoji-sync script).
 *
 * @type {readonly string[]}
 * @constant
 */
const REQUIRED_ENV = [
  "DISCORD_TOKEN",
  "DISCORD_ID",
  "GALA_DISCORD_ID",
  "GALA_USER_ID",
  "TWITCH_CHANNEL",
  "TWITCH_USERNAME",
  "TWITCH_URL",
  "YOUTUBE_URL",
  "DISCORD_NOTIFICATION_CHANNEL",
  "POST_DATA_WEBHOOK",
];

/**
 * Verify that every variable listed in {@link REQUIRED_ENV} is defined. On failure
 * a fatal message is written to stderr and the process exits with code 1 — this
 * runs before any logger or client is constructed, so `console.error` is the
 * appropriate output channel.
 *
 * @returns {void}
 * @throws Never throws; calls `process.exit(1)` on failure.
 */
function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(
      `FATAL: Missing required environment variables: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  sysLog("info", "main:validateEnv ok", { required: REQUIRED_ENV.length });
}

validateEnv();

sysLog("info", "main:bootstrap starting");

const manager = new ClientManager();

manager.initialize().catch((error) => {
  sysLog("error", "main:initialize failed", {
    err: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
