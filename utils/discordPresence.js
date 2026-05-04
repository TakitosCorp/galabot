/**
 * @module utils/discordPresence
 * @description
 * Helpers for managing the Discord bot's presence (status + activity). Exposes
 * two entry points: one that sets a Streaming activity when a stream goes live,
 * and one that resets to a random idle activity when the stream ends or on first
 * connection. Both are no-ops when the client is unavailable.
 */

"use strict";

const { ActivityType } = require("discord.js");
const { discordLog } = require("./loggers");

/**
 * Set the bot's presence to "Streaming" with the given title and URL.
 * Used when any platform stream goes live.
 *
 * @param {import('discord.js').Client|null} discordClient
 * @param {string} streamTitle - Activity label shown next to the bot's name.
 * @param {string} streamUrl - Must be a valid Twitch or YouTube URL; discord.js
 *   requires a real streaming URL for `ActivityType.Streaming`.
 * @returns {void}
 */
function setStreamingStatus(discordClient, streamTitle, streamUrl) {
  if (!discordClient || !discordClient.isReady()) return;
  try {
    discordClient.user.setPresence({
      activities: [
        { name: streamTitle, type: ActivityType.Streaming, url: streamUrl },
      ],
      status: "online",
    });
    discordLog("info", "discord:presence streaming", { streamTitle, streamUrl });
  } catch (err) {
    discordLog("error", "discord:presence setStreaming failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

/**
 * Reset the bot's presence to a random idle activity drawn from
 * `data/resources.json → en.activities`. Called on stream end and on
 * the initial `ClientReady` event.
 *
 * @param {import('discord.js').Client|null} discordClient
 * @returns {void}
 */
function setIdleStatus(discordClient) {
  if (!discordClient || !discordClient.isReady()) return;
  try {
    const resources = require("../data/resources.json");
    const activities = resources.en.activities;
    const pick = activities[Math.floor(Math.random() * activities.length)];
    discordClient.user.setPresence({
      activities: [{ name: pick.name, type: ActivityType[pick.type] }],
      status: "online",
    });
    discordLog("info", "discord:presence idle", {
      activity: pick.name,
      type: pick.type,
    });
  } catch (err) {
    discordLog("error", "discord:presence setIdle failed", {
      err: err.message,
      stack: err.stack,
    });
  }
}

module.exports = { setStreamingStatus, setIdleStatus };
