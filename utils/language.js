/**
 * @module utils/language
 * @description
 * Single-channel language resolver. Maps a Discord channel id to either `"en"`
 * or `"es"` based on the optional `SPANISH_CHANNEL_ID` env var — every other
 * channel (including DMs) falls back to English.
 */

"use strict";

/**
 * Resolve the localisation key for a Discord channel.
 *
 * @param {string|null|undefined} channelId - Discord channel id where the message/interaction was sent.
 * @returns {("en"|"es")} `"es"` only when `channelId` matches `process.env.SPANISH_CHANNEL_ID`.
 */
function getLanguage(channelId) {
  return channelId === process.env.SPANISH_CHANNEL_ID ? "es" : "en";
}

module.exports = { getLanguage };
