/**
 * @module utils/loggers
 * @description
 * Winston-backed logging facade. Five domain channels (Twitch, Discord, DB, SYS, YouTube)
 * each write to a dedicated `logs/<channel>.log` file plus a shared `logs/combined.log`
 * and the console. Each channel exposes a tiny wrapper function with a stable signature:
 *
 * ```js
 * twitchLog('info', 'chat:connected', { channel });
 * dbLog('error', 'streams:insert failed', { err: err.message, stack: err.stack });
 * ```
 *
 * The third `context` argument is optional — when present it is JSON-serialized and
 * appended to the message so log lines stay grep-friendly while still carrying
 * structured data for debugging.
 *
 * @typedef {import('./types').LogLevel} LogLevel
 * @typedef {import('./types').LogContext} LogContext
 * @typedef {import('./types').DomainLogFn} DomainLogFn
 */

"use strict";

const winston = require("winston");
const fs = require("fs");
const path = require("path");

/**
 * Create the `logs/` directory at the project root if it does not exist yet.
 * Called once at module load so file transports never race against `mkdir`.
 *
 * @returns {string} Absolute path to the `logs/` directory.
 */
function ensureLogsFolder() {
  const logsDir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

const logsDir = ensureLogsFolder();

/**
 * Shared file transport that aggregates every channel into a single chronological log.
 * Useful when correlating events that span Discord + Twitch + DB.
 * @type {winston.transport}
 */
const combinedFileTransport = new winston.transports.File({
  filename: path.join(logsDir, "combined.log"),
});

/**
 * Shared console transport. All channels also stream to stdout so `docker logs`
 * shows everything without needing to tail individual files.
 * @type {winston.transport}
 */
const consoleTransport = new winston.transports.Console();

/**
 * Build a Winston logger pre-configured with our timestamp + tagged-prefix format.
 * Each channel uses the same shape, only the `[Tag]` and per-channel filename differ.
 *
 * @param {string} tag - Short human label rendered between the timestamp and level (e.g. "Twitch").
 * @param {string} filename - Channel-specific file name inside `logs/` (e.g. "twitch.log").
 * @returns {winston.Logger} Configured Winston logger instance.
 */
function buildLogger(tag, filename) {
  return winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${tag}] ${level}: ${message}`;
      }),
    ),
    transports: [
      consoleTransport,
      new winston.transports.File({ filename: path.join(logsDir, filename) }),
      combinedFileTransport,
    ],
  });
}

const twitchLogger = buildLogger("Twitch", "twitch.log");
const discordLogger = buildLogger("Discord", "discord.log");
const dbLogger = buildLogger("DB", "db.log");
const sysLogger = buildLogger("SYS", "system.log");
const youtubeLogger = buildLogger("YouTube", "youtube.log");

/**
 * Format an optional context object so it tail-attaches to the log message.
 * Returns an empty string when the context is missing or empty.
 *
 * @param {LogContext} [context] - Structured context to serialize.
 * @returns {string} Either an empty string or ` | <json>` ready for concatenation.
 */
function formatContext(context) {
  if (!context || typeof context !== "object") return "";
  const keys = Object.keys(context);
  if (keys.length === 0) return "";
  try {
    return ` | ${JSON.stringify(context)}`;
  } catch {
    return ` | [unserializable context]`;
  }
}

/**
 * Emit a log line on the Twitch channel.
 * @type {DomainLogFn}
 */
function twitchLog(level, message, context) {
  twitchLogger.log({ level, message: `${message}${formatContext(context)}` });
}

/**
 * Emit a log line on the Discord channel.
 * @type {DomainLogFn}
 */
function discordLog(level, message, context) {
  discordLogger.log({ level, message: `${message}${formatContext(context)}` });
}

/**
 * Emit a log line on the database channel.
 * @type {DomainLogFn}
 */
function dbLog(level, message, context) {
  dbLogger.log({ level, message: `${message}${formatContext(context)}` });
}

/**
 * Emit a log line on the system channel (lifecycle, env validation, shutdown).
 * @type {DomainLogFn}
 */
function sysLog(level, message, context) {
  sysLogger.log({ level, message: `${message}${formatContext(context)}` });
}

/**
 * Emit a log line on the YouTube channel.
 * @type {DomainLogFn}
 */
function youtubeLog(level, message, context) {
  youtubeLogger.log({ level, message: `${message}${formatContext(context)}` });
}

module.exports = {
  ensureLogsFolder,
  twitchLog,
  discordLog,
  dbLog,
  sysLog,
  youtubeLog,
};
