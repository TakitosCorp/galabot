/**
 * @module messages/discord/msgAI
 * @description
 * Handles bot @mention messages that are not greetings by forwarding the
 * user's text to the configured Gemini model and replying with the result.
 * A typing indicator is shown while Gemini processes the request and is
 * refreshed every 9 s so it stays visible for slow responses.
 *
 * Three layers of throttling protect the free-tier quota:
 *  1. Per-user cooldown (`AI_USER_COOLDOWN_MS`): a user pinging the bot again
 *     before the cooldown elapses receives a "slow down" reply and the
 *     message is **not** queued.
 *  2. Global FIFO queue (`utils/discord/aiQueue.js`): only one Gemini request
 *     is in flight at a time, regardless of how many users ping in parallel.
 *  3. Global rolling-minute RPM cap (`AI_GLOBAL_RPM_LIMIT`): the queue worker
 *     waits, never drops, when dispatching the next item would exceed the cap.
 *
 * Ids in `GEMINI_NO_LIMITS_IDS` bypass the per-user cooldown but still go
 * through the queue and global RPM cap (the upstream limit is hard).
 *
 * Before each query, upcoming stream data is fetched from the `upcoming_streams`
 * DB table and prepended to the user message (via `queryGemini`) so GalaMiau can
 * answer schedule questions accurately. Each stream entry includes a Discord
 * timestamp (`<t:UNIX:F>`) so the model can copy it verbatim into its reply,
 * letting Discord render it in every user's local timezone.
 * A fetch failure is logged as a warning and the query proceeds without context.
 */

"use strict";

const { discordLog } = require("../../utils/core/loggers");
const { queryGemini } = require("../../utils/discord/geminiClient");
const { enqueue, getQueueLength } = require("../../utils/discord/aiQueue");
const { getAllUpcomingStreams } = require("../../db/upcomingStreams");
const { AI_USER_COOLDOWN_MS } = require("../../utils/core/constants");

/**
 * Last-accepted-request timestamp per user (epoch ms). Drives the per-user
 * cooldown check. Reset on bot restart.
 * @type {Map<string, number>}
 */
const lastRequestMs = new Map();

/**
 * Set of Discord user ids that bypass the per-user cooldown entirely.
 * Populated once from the `GEMINI_NO_LIMITS_IDS` env var (comma-separated).
 * @type {Set<string>}
 */
const noLimitIds = new Set(
  (process.env.GEMINI_NO_LIMITS_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

/**
 * Handle a bot @mention that does not match a greeting. Enforces per-user
 * cooldown, strips the mention from the message, queues a Gemini call, and
 * replies with the AI-generated text once the worker reaches it.
 *
 * @async
 * @param {import('discord.js').Message} message - The incoming guild message.
 * @returns {Promise<void>}
 */
async function handleAI(message) {
  const userId = message.author.id;
  const channelId = message.channelId;
  const guildId = message.guildId;

  discordLog("debug", "ai:handleAI", { userId, channelId, guildId });

  try {
    const now = Date.now();

    if (noLimitIds.has(userId)) {
      discordLog("debug", "ai:cooldown exempt", { userId });
    } else {
      const last = lastRequestMs.get(userId);
      if (last && now - last < AI_USER_COOLDOWN_MS) {
        const remainingMs = AI_USER_COOLDOWN_MS - (now - last);
        const remainingSec = Math.ceil(remainingMs / 1000);
        discordLog("info", "ai:cooldown active", {
          userId,
          channelId,
          remainingMs,
        });
        await message.reply(
          `Slow down! Wait ${remainingSec}s before pinging me again.`,
        );
        return;
      }
      lastRequestMs.set(userId, now);
    }

    // Strip all Discord user mentions so the model doesn't receive raw snowflakes.
    const stripped = message.content.replace(/<@!?\d+>/g, "").trim();

    if (!stripped) {
      discordLog("debug", "ai:empty-content", { userId, channelId });
      return;
    }

    // Always include the schedule block — empty case is an explicit "(none)"
    // marker so the model can't claim ignorance of the rule when no data exists.
    let upcomingCount = 0;
    let streamContext = "--- Upcoming Streams ---\n(none)";
    try {
      const upcoming = await getAllUpcomingStreams();
      upcomingCount = upcoming.length;
      if (upcoming.length) {
        const lines = upcoming.map((s) => {
          const provider = s.provider === "twitch" ? "Twitch" : "YouTube";
          const cat = s.category ? ` [${s.category}]` : "";
          const ts = s.scheduled_start_ts
            ? ` <t:${s.scheduled_start_ts}:F> (<t:${s.scheduled_start_ts}:R>)`
            : ` ${s.scheduled_start}`;
          return `[${provider}]${cat} "${s.title}" |${ts} | ${s.url}`;
        });
        streamContext = `--- Upcoming Streams ---\n${lines.join("\n")}`;
      }
      discordLog("debug", "ai:upcoming-context fetched", {
        userId,
        channelId,
        upcomingCount,
      });
    } catch (err) {
      // On fetch failure we still send the (none) block — better than letting
      // the model invent dates if the context is silently dropped.
      discordLog("warn", "ai:upcoming-context fetch failed", {
        userId,
        channelId,
        err: err.message,
      });
    }

    discordLog("debug", "ai:queueing gemini", {
      userId,
      channelId,
      contentLength: stripped.length,
      upcomingCount,
      queueDepth: getQueueLength(),
    });

    // Show typing indicator and refresh it every 9 s (Discord clears it after
    // 10 s). It must stay visible across the queue wait, RPM throttle wait, and
    // the actual model call.
    await message.channel.sendTyping();
    discordLog("debug", "ai:typing started", { userId, channelId });

    const typingInterval = setInterval(
      () => message.channel.sendTyping().catch(() => {}),
      9_000,
    );

    const startMs = Date.now();
    let aiResponse;
    try {
      aiResponse = await enqueue(() => queryGemini(stripped, streamContext));
    } finally {
      clearInterval(typingInterval);
    }

    const durationMs = Date.now() - startMs;

    await message.reply(aiResponse);

    discordLog("info", "ai:reply sent", {
      userId,
      channelId,
      guildId,
      durationMs,
      responseLength: aiResponse.length,
    });
  } catch (err) {
    // Treat both "no key configured" and "quota exhausted on all keys" as
    // expected/recoverable conditions — warn level, no user-facing error.
    const isExpected =
      err.message === "GEMINI_API_KEY not configured" ||
      err.message === "GEMINI quota exhausted";

    discordLog(isExpected ? "warn" : "error", "ai:handleAI failed", {
      userId,
      channelId,
      guildId,
      err: err.message,
      stack: err.stack,
    });
    // No reply on error — fail silently to the user.
  }
}

module.exports = { handleAI };
