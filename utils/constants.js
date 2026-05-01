'use strict';

module.exports = {
  // Greeting cooldown applied per-user across Discord and Twitch
  GREETING_COOLDOWN_MS: 4 * 60 * 60 * 1000,

  // Timeout applied per warn: warn count × this value (in ms)
  WARN_TIMEOUT_BASE_MS: 10 * 60 * 1000,

  // Number of warns before a permanent ban is issued
  MAX_WARN_BEFORE_BAN: 3,

  // Maximum character length for a warn reason
  MAX_WARN_REASON_LENGTH: 512,

  // Twitch token is considered valid for 59 days after refresh
  TOKEN_VALIDITY_MS: 59 * 24 * 60 * 60 * 1000,

  // How often to sample the live viewer count for the running average.
  // 60 s gives 1 API call/min which is well within Twitch rate limits.
  VIEWER_POLL_INTERVAL_MS: 60 * 1000,

  // Puppeteer timing constants
  PUPPETEER_PAGE_TIMEOUT_MS: 45_000,
  PUPPETEER_GOTO_TIMEOUT_MS: 15_000,
  PUPPETEER_SCREENSHOT_TIMEOUT_MS: 5_000,
  PUPPETEER_SELECTOR_TIMEOUT_MS: 5_000,
  NEXT_STREAMS_SETTLE_MS: 800,
  BANNER_SETTLE_MS: 500,
};
