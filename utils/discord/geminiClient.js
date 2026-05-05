/**
 * @module utils/discord/geminiClient
 * @description
 * Thin wrapper around the `@google/genai` SDK for AI-powered Discord replies.
 * The system prompt is read once from `data/AIPrompt.md` at module load time
 * and cached for the process lifetime. Each call starts a fresh stateless chat —
 * no conversation history is maintained between messages.
 *
 * Gemma-family models exposed through the Gemini API reject the
 * `systemInstruction` field ("Developer instruction is not enabled for
 * models/gemma-*"). To stay compatible with both Gemma and Gemini families,
 * the system prompt is folded into the user content as a leading block,
 * followed by the optional `additionalContext` (the upcoming-streams block
 * produced by `messages/discord/msgAI.js`), and finally the user's question.
 * Small models attend most reliably to content adjacent to the question, so
 * the schedule context sits closest to it.
 *
 * **Quota handling**. Mirrors the YouTube poller pattern:
 *  - `GEMINI_API_KEY` is the primary key; `GEMINI_API_KEY_2` is an optional
 *    fallback (e.g. a second free-tier project).
 *  - On 429 (RPM/RPD exhausted) the wrapper switches to the fallback for
 *    subsequent calls. If both keys are exhausted, a `GEMINI_QUOTA_COOLDOWN_MS`
 *    cooldown is set; further calls throw `Error("GEMINI quota exhausted")`
 *    until the cooldown expires (auto-reset inside `getApiKey()`).
 *  - The caller in `msgAI.js` treats both "not configured" and
 *    "quota exhausted" errors as warn-level → silent failure to the user.
 *
 * Requires `GEMINI_API_KEY` in the environment. `GEMINI_MODEL` is optional and
 * defaults to `gemma-4-26b-a4b-it`.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
const { discordLog, sysLog } = require("../core/loggers");
const { GEMINI_QUOTA_COOLDOWN_MS } = require("../core/constants");

const PROMPT_PATH = path.join(__dirname, "..", "..", "data", "AIPrompt.md");

/**
 * System prompt loaded from `data/AIPrompt.md`. Cached at startup so the file
 * is only read once per process.
 * @type {string}
 */
const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf8").trim();

sysLog("info", "geminiClient:prompt loaded", {
  path: PROMPT_PATH,
  promptLength: systemPrompt.length,
});

/**
 * Mutable in-memory state for quota fallback handling.
 *
 * `usingFallbackKey` flips to true after the primary key returns 429.
 * `quotaExhaustedUntil` is set after the fallback ALSO returns 429 (or when
 * primary fails and no fallback is configured); it's an epoch-ms timestamp,
 * 0 meaning "no cooldown active".
 */
const state = {
  usingFallbackKey: false,
  quotaExhaustedUntil: 0,
};

/**
 * Pick the API key the next request should use. Auto-resets the fallback
 * flag and cooldown once `GEMINI_QUOTA_COOLDOWN_MS` has elapsed since the
 * last exhaustion, so the bot recovers automatically (the daily RPD quota
 * resets at midnight UTC anyway).
 *
 * @returns {string|undefined}
 */
function getApiKey() {
  if (
    state.quotaExhaustedUntil > 0 &&
    state.quotaExhaustedUntil <= Date.now()
  ) {
    discordLog(
      "info",
      "geminiClient:quota cooldown ended, resetting key state",
    );
    state.quotaExhaustedUntil = 0;
    state.usingFallbackKey = false;
  }
  if (state.usingFallbackKey && process.env.GEMINI_API_KEY_2) {
    return process.env.GEMINI_API_KEY_2;
  }
  return process.env.GEMINI_API_KEY;
}

/**
 * Detect whether a thrown error is a 429 from the Gemini SDK.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isQuotaError(err) {
  if (!err || typeof err !== "object") return false;
  if (err.status === 429) return true;
  // The SDK sometimes embeds the status in the message rather than as a numeric
  // field — fall back to a string sniff to be safe.
  const msg = String(err.message ?? "");
  return /429|RESOURCE_EXHAUSTED|quotaExceeded/i.test(msg);
}

/**
 * Send a single user message to the configured Gemini model and return the
 * assistant's reply. Each invocation is stateless — no history is carried over.
 *
 * When `additionalContext` is provided it is prepended directly to the user
 * message so the model sees the data immediately adjacent to the question.
 * This is more reliable than appending to the system prompt for small models
 * that tend to ignore additions to a long system prompt.
 *
 * @async
 * @param {string} userContent - The user's message text (mention stripped, already trimmed).
 * @param {string|null} [additionalContext=null] - Optional context block prepended to the user message.
 * @returns {Promise<string>} The assistant's reply text.
 * @throws {Error} `"GEMINI_API_KEY not configured"` when no key is set,
 *   `"GEMINI quota exhausted"` while the cooldown is active, or the underlying
 *   SDK error for any other failure.
 */
async function queryGemini(userContent, additionalContext = null) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  if (state.quotaExhaustedUntil > Date.now()) {
    throw new Error("GEMINI quota exhausted");
  }

  const model = process.env.GEMINI_MODEL ?? "gemma-4-26b-a4b-it";

  // Gemma rejects `systemInstruction`, so the system prompt is folded into
  // the user content. Order: prompt → context block → user question, so the
  // schedule data sits adjacent to the question.
  const parts = [systemPrompt];
  if (additionalContext) parts.push(additionalContext);
  parts.push(userContent);
  const resolvedUser = parts.join("\n\n");

  // Up to two attempts: primary key, then fallback (if configured). A 429
  // from both terminates the loop and sets the cooldown.
  const maxAttempts = process.env.GEMINI_API_KEY_2 ? 2 : 1;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = getApiKey();
    discordLog("debug", "geminiClient:queryGemini start", {
      model,
      contentLength: userContent.length,
      hasContext: Boolean(additionalContext),
      attempt: attempt + 1,
      usingFallbackKey: state.usingFallbackKey,
    });

    const ai = new GoogleGenAI({ apiKey });
    const startMs = Date.now();

    try {
      const response = await ai.models.generateContent({
        model,
        contents: resolvedUser,
      });

      const durationMs = Date.now() - startMs;
      const raw = response.text ?? "";

      const thinkMatches = (raw.match(/<think>[\s\S]*?<\/think>/gi) ?? [])
        .length;
      const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      if (thinkMatches > 0) {
        discordLog("warn", "geminiClient:think-blocks stripped", {
          model,
          count: thinkMatches,
          rawLength: raw.length,
          cleanedLength: cleaned.length,
        });
      }

      discordLog("info", "geminiClient:queryGemini complete", {
        model,
        durationMs,
        responseLength: cleaned.length,
        thinkBlocksStripped: thinkMatches,
        usingFallbackKey: state.usingFallbackKey,
      });

      return cleaned;
    } catch (err) {
      lastErr = err;

      if (!isQuotaError(err)) {
        // Non-quota error — don't retry, surface immediately.
        throw err;
      }

      if (process.env.GEMINI_API_KEY_2 && !state.usingFallbackKey) {
        discordLog(
          "warn",
          "geminiClient:quota primary-exhausted, switching to fallback key",
          { err: err.message },
        );
        state.usingFallbackKey = true;
        continue;
      }

      // Either no fallback configured, or fallback also exhausted.
      state.quotaExhaustedUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
      discordLog("error", "geminiClient:quota exhausted on all keys", {
        cooldownMs: GEMINI_QUOTA_COOLDOWN_MS,
        err: err.message,
      });
      throw new Error("GEMINI quota exhausted");
    }
  }

  // Defensive: shouldn't reach here, but rethrow whatever we last saw.
  throw lastErr ?? new Error("GEMINI quota exhausted");
}

module.exports = { queryGemini };
