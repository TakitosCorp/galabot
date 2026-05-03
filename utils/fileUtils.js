/**
 * @module utils/fileUtils
 * @description
 * Tiny synchronous helpers for working with JSON files inside the project's `data/`
 * folder (Twitch token cache, YouTube category cache, persisted resources, etc.).
 *
 * All read/write helpers swallow filesystem errors and route them through `sysLog`
 * so callers can keep their happy-path code clean. They return safe defaults
 * (the supplied `defaultValue`, an empty array, etc.) instead of throwing.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { sysLog } = require("./loggers");

/**
 * Read a JSON file from disk and parse it. If the file does not exist it is created
 * (with `defaultValue` as its initial contents) before reading. Any parse / IO error
 * is logged and `defaultValue` is returned so callers can keep going.
 *
 * @template T
 * @param {string} filePath - Absolute path to the target JSON file.
 * @param {T} [defaultValue=null] - Value to return on failure and to seed the file with on first run.
 * @returns {T} Parsed JSON contents, or `defaultValue` on any failure.
 */
function readJSON(filePath, defaultValue = null) {
  ensureFileExists(filePath, defaultValue);
  try {
    sysLog("debug", "fileUtils:readJSON", { filePath });
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    sysLog("error", "fileUtils:readJSON failed", {
      filePath,
      err: err.message,
      stack: err.stack,
    });
    return defaultValue;
  }
}

/**
 * Pretty-print JSON-serialize `data` and write it to disk synchronously.
 * Failures are logged but not thrown — callers should treat persistence as best-effort.
 *
 * @param {string} filePath - Absolute path to write to.
 * @param {unknown} data - Anything `JSON.stringify` accepts.
 * @returns {void}
 */
function writeJSON(filePath, data) {
  try {
    sysLog("debug", "fileUtils:writeJSON", { filePath });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    sysLog("error", "fileUtils:writeJSON failed", {
      filePath,
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * Create `filePath` with `defaultValue` as initial JSON contents when it doesn't already exist.
 * No-op when the file is already present.
 *
 * @param {string} filePath - Absolute target path.
 * @param {unknown} [defaultValue={}] - Initial JSON payload to seed the file with.
 * @returns {void}
 */
function ensureFileExists(filePath, defaultValue = {}) {
  if (!fs.existsSync(filePath)) {
    try {
      sysLog("info", "fileUtils:ensureFileExists creating", { filePath });
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    } catch (err) {
      sysLog("error", "fileUtils:ensureFileExists failed", {
        filePath,
        err: err.message,
        stack: err.stack,
      });
    }
  }
}

/**
 * Resolve a path relative to the project's `data/` directory.
 * @param {string} relativePath - File name (e.g. `"twitch.json"`) or sub-path inside `data/`.
 * @returns {string} Absolute filesystem path.
 */
function getFilePath(relativePath) {
  return path.join(__dirname, "../data", relativePath);
}

/**
 * Delete a file from disk if it exists. Failures are logged, never thrown.
 * @param {string} filePath - Absolute path of the file to remove.
 * @returns {void}
 */
function deleteFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      sysLog("debug", "fileUtils:deleteFile", { filePath });
      fs.unlinkSync(filePath);
    } catch (err) {
      sysLog("error", "fileUtils:deleteFile failed", {
        filePath,
        err: err.message,
        stack: err.stack,
      });
    }
  }
}

/**
 * List the immediate entries of a directory. Returns an empty array on error.
 * @param {string} dirPath - Absolute directory path to enumerate.
 * @returns {string[]} Names of the directory entries.
 */
function listFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch (err) {
    sysLog("error", "fileUtils:listFiles failed", {
      dirPath,
      err: err.message,
      stack: err.stack,
    });
    return [];
  }
}

module.exports = {
  readJSON,
  writeJSON,
  getFilePath,
  ensureFileExists,
  deleteFile,
  listFiles,
};
