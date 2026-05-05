/**
 * @module messages/discord/msgAI
 * @description
 * Handles bot @mention messages that are not greetings by forwarding the
 * user's text to the configured Ollama model and replying with the result.
 * A typing indicator is shown while Ollama processes the request and is
 * refreshed every 9 s so it stays visible for slow responses.
 *
 * Rate limiting is enforced in-process via a sliding-window Map: at most
 * `AI_RATE_LIMIT_MAX` requests per user within `AI_RATE_LIMIT_WINDOW_MS`.
 * This state resets on bot restart, which is acceptable for a per-minute cap.
 *
 * @typedef {import('../../utils/types').AiRateLimitEntry} AiRateLimitEntry
 */

"use strict";

const { discordLog } = require("../../utils/core/loggers");
const { queryOllama } = require("../../utils/discord/ollamaClient");
const {
  AI_RATE_LIMIT_MAX,
  AI_RATE_LIMIT_WINDOW_MS,
} = require("../../utils/core/constants");

/**
 * In-memory sliding-window rate-limit store. Keys are Discord user ids;
 * values are arrays of epoch-ms timestamps from recent AI requests.
 * @type {Map<string, number[]>}
 */
const rateLimitMap = new Map();

/**
 * Set of Discord user ids that bypass the per-minute rate limit entirely.
 * Populated once from the `OLLAMA_NO_LIMITS_IDS` env var (comma-separated).
 * @type {Set<string>}
 */
const noLimitIds = new Set(
  (process.env.OLLAMA_NO_LIMITS_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

/**
 * Handle a bot @mention that does not match a greeting. Enforces per-user
 * rate limiting, strips the mention from the message, calls Ollama, and
 * replies with the AI-generated text.
 *
 * @async
 * @param {import('discord.js').Message} message - The incoming guild message.
 * @returns {Promise<void>}
 */
async function handleAI(message) {
  const userId = message.author.id;

  try {
    const now = Date.now();

    if (!noLimitIds.has(userId)) {
      const recent = (rateLimitMap.get(userId) ?? []).filter(
        (ts) => now - ts < AI_RATE_LIMIT_WINDOW_MS,
      );

      if (recent.length >= AI_RATE_LIMIT_MAX) {
        discordLog("debug", "ai:rate-limited", { userId });
        await message.reply(
          "You're sending messages too fast! Please wait a moment before asking me again.",
        );
        return;
      }

      recent.push(now);
      rateLimitMap.set(userId, recent);
    }

    // Strip all Discord user mentions so the model doesn't receive raw snowflakes.
    const stripped = message.content.replace(/<@!?\d+>/g, "").trim();

    if (!stripped) {
      return;
    }

    discordLog("debug", "ai:querying ollama", {
      userId,
      contentLength: stripped.length,
    });

    // Show typing indicator and refresh it every 9 s (Discord clears it after 10 s).
    await message.channel.sendTyping();
    const typingInterval = setInterval(
      () => message.channel.sendTyping().catch(() => {}),
      9_000,
    );

    let aiResponse;
    try {
      aiResponse = await queryOllama(stripped);
    } finally {
      clearInterval(typingInterval);
    }

    await message.reply(aiResponse);

    discordLog("info", "ai:reply sent", {
      userId,
      contentLength: aiResponse.length,
    });
  } catch (err) {
    const isUnconfigured = err.message === "OLLAMA_URL not configured";

    discordLog(isUnconfigured ? "warn" : "error", "ai:handleAI failed", {
      userId,
      err: err.message,
      stack: err.stack,
    });
    // No reply on error — fail silently to the user.
  }
}

module.exports = { handleAI };
