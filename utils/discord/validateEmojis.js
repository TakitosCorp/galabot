/**
 * @module utils/discord/validateEmojis
 * @description
 * Startup sanity check: scans every `{emojis.X}` placeholder used across
 * `data/resources.json`'s greeting templates and confirms `X` exists as a key
 * in `data/emojis.json`. Catches the class of bug where a guild emoji re-sync
 * (`npm run sync-emojis`) renames or removes an emoji that a greeting
 * template still references, instead of silently sending users literal
 * unresolved text like `{emojis.galabot_foo}`.
 */

"use strict";

const resources = require("../../data/resources.json");
const emojis = require("../../data/emojis.json");
const { discordLog } = require("../core/loggers");

const PLACEHOLDER_PATTERN = /\{emojis\.([a-zA-Z0-9_]+)\}/g;

/**
 * Scan every greeting template in every configured language for
 * `{emojis.X}` placeholders and warn about any `X` missing from
 * `data/emojis.json`.
 *
 * @returns {string[]} Sorted list of orphaned placeholder names (empty when clean).
 */
function validateEmojis() {
  const orphaned = new Set();

  for (const lang of Object.keys(resources)) {
    const greetings = resources[lang]?.greetingResponses ?? [];
    for (const greeting of greetings) {
      for (const match of greeting.matchAll(PLACEHOLDER_PATTERN)) {
        const name = match[1];
        if (!(name in emojis)) {
          orphaned.add(name);
        }
      }
    }
  }

  const result = [...orphaned].sort();
  if (result.length > 0) {
    discordLog("warn", "validateEmojis:orphaned placeholders found", {
      count: result.length,
      names: result,
    });
  } else {
    discordLog("debug", "validateEmojis:ok");
  }
  return result;
}

module.exports = { validateEmojis };
