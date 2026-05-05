/**
 * @module utils/discord/ollamaClient
 * @description
 * Thin wrapper around the `ollama` npm client for AI-powered Discord replies.
 * The system prompt is read once from `data/AIPrompt.md` at module load time
 * and cached for the process lifetime. Each call starts a fresh stateless chat —
 * no conversation history is maintained between messages.
 *
 * Requires `OLLAMA_URL` in the environment. `OLLAMA_MODEL` is optional and
 * defaults to `gemma3:1b`.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { Ollama } = require("ollama");
const { discordLog } = require("../core/loggers");

const PROMPT_PATH = path.join(__dirname, "..", "..", "data", "AIPrompt.md");

/**
 * System prompt loaded from `data/AIPrompt.md`. Cached at startup so the file
 * is only read once per process.
 * @type {string}
 */
const systemPrompt = fs.readFileSync(PROMPT_PATH, "utf8").trim();

/**
 * Send a single user message to the configured Ollama model and return the
 * assistant's reply. Each invocation is stateless — no history is carried over.
 *
 * @async
 * @param {string} userContent - The user's message text (mention stripped, already trimmed).
 * @returns {Promise<string>} The assistant's reply text.
 * @throws {Error} When `OLLAMA_URL` is not set, or when the Ollama request fails.
 */
async function queryOllama(userContent) {
  if (!process.env.OLLAMA_URL) {
    throw new Error("OLLAMA_URL not configured");
  }

  const model = process.env.OLLAMA_MODEL ?? "gemma3:1b";

  discordLog("debug", "ollamaClient:queryOllama", {
    model,
    contentLength: userContent.length,
  });

  const ollama = new Ollama({ host: process.env.OLLAMA_URL });

  const response = await ollama.chat({
    model,
    think: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  // Strip any <think>…</think> blocks emitted by reasoning-capable models
  // that ignore the think:false flag.
  return response.message.content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

module.exports = { queryOllama };
