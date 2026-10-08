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
 *    fallback (e.g. a second free-tier project). Either works on its own.
 *  - On 429 (RPM/RPD exhausted) or an invalid/denied key (400/401/403) the
 *    wrapper switches to the fallback for subsequent calls. If both keys are
 *    quota-exhausted, a `GEMINI_QUOTA_COOLDOWN_MS` cooldown is set; further
 *    calls throw `Error("GEMINI quota exhausted")` until the cooldown expires
 *    (auto-reset inside `getApiKey()`). If the last failure was a key error
 *    instead, the real error is rethrown and no cooldown is set.
 *  - The caller in `msgAI.js` treats both "not configured" and
 *    "quota exhausted" errors as warn-level → silent failure to the user.
 *
 * Requires `GEMINI_API_KEY` or `GEMINI_API_KEY_2` in the environment.
 * `GEMINI_MODEL` is optional and defaults to `gemma-4-26b-a4b-it`.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { aiLog } from "../core/loggers.js";
import { GEMINI_QUOTA_COOLDOWN_MS } from "../core/constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Max retries for transient (5xx) Gemini errors before surfacing to caller. */
const TRANSIENT_RETRY_LIMIT = 2;
/** Delay in ms between transient-error retries. */
const TRANSIENT_RETRY_DELAY_MS = 2_000;

const PROMPT_PATH = path.join(__dirname, "..", "..", "data", "AIPrompt.md");

/**
 * Read, substitute template variables, and return the processed prompt string.
 * @returns {string}
 */
function readPrompt() {
  let raw = fs.readFileSync(PROMPT_PATH, "utf8");
  raw = raw.replace(
    /\{\{GALA_USER_ID\}\}/g,
    process.env.GALA_USER_ID || "{{GALA_USER_ID}}",
  );
  raw = raw.replace(/\{\{BOT_NAME\}\}/g, process.env.BOT_NAME || "GalaBot");
  raw = raw.replace(
    /\{\{MOD_ROLE_ID\}\}/g,
    process.env.MOD_ROLE_ID || "{{MOD_ROLE_ID}}",
  );
  raw = raw.replace(
    /\{\{NSFW_CHANNEL\}\}/g,
    process.env.NSFW_CHANNEL_ID
      ? `<#${process.env.NSFW_CHANNEL_ID}>`
      : "the NSFW channel",
  );
  return raw.trim();
}

/**
 * SHA-256 of the raw file bytes — used to detect prompt changes without
 * keeping the full content in memory twice.
 * @returns {string}
 */
function hashPromptFile() {
  const raw = fs.readFileSync(PROMPT_PATH);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Processed system prompt, refreshed automatically when the file changes. */
let systemPrompt = readPrompt();
/** SHA-256 of the file content at last load — used for change detection. */
let promptHash = hashPromptFile();

aiLog("info", "geminiClient:prompt loaded", {
  path: PROMPT_PATH,
  promptLength: systemPrompt.length,
  hash: promptHash,
});

/**
 * Re-read and reprocess the prompt if the file has changed since last load.
 * Called at the top of every `queryGemini` invocation so prompt edits take
 * effect on the next query without restarting the bot.
 */
function refreshPromptIfChanged() {
  const current = hashPromptFile();
  if (current === promptHash) return;
  systemPrompt = readPrompt();
  promptHash = current;
  aiLog("info", "geminiClient:prompt reloaded", {
    path: PROMPT_PATH,
    promptLength: systemPrompt.length,
    hash: current,
  });
}

/**
 * Mutable in-memory state for quota fallback handling.
 *
 * `usingFallbackKey` flips to true after the primary key returns 429 or is
 * rejected as invalid.
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
    aiLog("info", "geminiClient:quota cooldown ended, resetting key state");
    state.quotaExhaustedUntil = 0;
    state.usingFallbackKey = false;
  }
  if (state.usingFallbackKey && process.env.GEMINI_API_KEY_2) {
    return process.env.GEMINI_API_KEY_2;
  }
  return process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2;
}

/**
 * Whether both the primary and the fallback key are configured.
 *
 * @returns {boolean}
 */
function hasBackupKey() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY_2);
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
  const msg = String(err.message ?? "");
  return /429|RESOURCE_EXHAUSTED|quotaExceeded/i.test(msg);
}

/**
 * Detect whether a thrown error means the API key itself is unusable
 * (invalid, revoked, or lacking permission) rather than temporarily throttled.
 *
 * @param {{ status?: number, message?: string }|null|undefined} err
 * @returns {boolean}
 */
function isKeyError(err) {
  if (!err || typeof err !== "object") return false;
  if (err.status === 401 || err.status === 403) return true;
  const msg = String(err.message ?? "");
  return /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(
    msg,
  );
}

/**
 * Detect whether a thrown error is a transient server-side error (5xx) worth
 * retrying rather than surfacing immediately to the user.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isTransientError(err) {
  if (!err || typeof err !== "object") return false;
  const status = err.status ?? 0;
  if (status >= 500 && status < 600) return true;
  const msg = String(err.message ?? "");
  return /5\d{2}|INTERNAL|UNAVAILABLE|overloaded/i.test(msg);
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
export async function queryGemini(userContent, additionalContext = null) {
  if (!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY_2) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  if (state.quotaExhaustedUntil > Date.now()) {
    throw new Error("GEMINI quota exhausted");
  }

  refreshPromptIfChanged();

  const model = process.env.GEMINI_MODEL ?? "gemma-4-26b-a4b-it";

  // Gemma rejects `systemInstruction`, so the system prompt is folded into
  // the user content. Order: prompt → context block → user question, so the
  // schedule data sits adjacent to the question.
  const parts = [systemPrompt];
  if (additionalContext) parts.push(additionalContext);
  parts.push(userContent);
  const resolvedUser = parts.join("\n\n");

  const maxKeyAttempts = hasBackupKey() ? 2 : 1;
  let lastErr = null;

  if (process.env.GEMINI_DEBUG_LOG === "true") {
    aiLog("debug", "geminiClient:request", {
      model,
      userContentLength: userContent.length,
      contextLength: additionalContext?.length ?? 0,
      context: additionalContext ?? "(none)",
    });
  }

  for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
    const apiKey = getApiKey();
    aiLog("debug", "geminiClient:queryGemini start", {
      model,
      contentLength: userContent.length,
      hasContext: Boolean(additionalContext),
      attempt: attempt + 1,
      usingFallbackKey: state.usingFallbackKey,
    });

    const ai = new GoogleGenAI({ apiKey });

    // Inner retry loop for transient 5xx errors on the same key.
    for (let retry = 0; retry <= TRANSIENT_RETRY_LIMIT; retry++) {
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
          aiLog("warn", "geminiClient:think-blocks stripped", {
            model,
            count: thinkMatches,
            rawLength: raw.length,
            cleanedLength: cleaned.length,
          });
        }

        aiLog("info", "geminiClient:queryGemini complete", {
          model,
          durationMs,
          responseLength: cleaned.length,
          thinkBlocksStripped: thinkMatches,
          usingFallbackKey: state.usingFallbackKey,
        });
        if (process.env.GEMINI_DEBUG_LOG === "true") {
          aiLog("info", "geminiClient:response", {
            model,
            durationMs,
            responseLength: cleaned.length,
            response: cleaned,
          });
        }

        return cleaned;
      } catch (err) {
        lastErr = err;

        if (isTransientError(err) && retry < TRANSIENT_RETRY_LIMIT) {
          aiLog("warn", "geminiClient:transient-error retrying", {
            model,
            attempt: attempt + 1,
            retry: retry + 1,
            err: err.message,
          });
          await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAY_MS));
          continue;
        }

        if (!isQuotaError(err) && !isKeyError(err)) {
          aiLog("error", "geminiClient:non-quota error", {
            model,
            err: err.message,
          });
          throw err;
        }

        break; // quota/key error — fall through to key-switching logic
      }
    }

    if (hasBackupKey() && !state.usingFallbackKey) {
      aiLog(
        "warn",
        "geminiClient:primary key unusable, switching to fallback key",
        { err: lastErr.message },
      );
      state.usingFallbackKey = true;
      continue;
    }

    if (!isQuotaError(lastErr)) {
      aiLog("error", "geminiClient:key rejected on all keys", {
        err: lastErr.message,
      });
      throw lastErr;
    }

    state.quotaExhaustedUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
    aiLog("error", "geminiClient:quota exhausted on all keys", {
      cooldownMs: GEMINI_QUOTA_COOLDOWN_MS,
      err: lastErr.message,
    });
    throw new Error("GEMINI quota exhausted");
  }

  throw lastErr ?? new Error("GEMINI quota exhausted");
}
