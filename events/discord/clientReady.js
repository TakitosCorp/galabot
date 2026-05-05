/**
 * @module events/discord/clientReady
 * @description
 * Fires once when the Discord gateway connection is established (`ClientReady`).
 * Sets the bot's initial idle presence so it always shows an activity from the
 * moment it connects, without waiting for a stream to start.
 */

"use strict";

const { Events } = require("discord.js");
const { setIdleStatus } = require("../../utils/discord/discordPresence");

/** @type {import('../../utils/types').DiscordEventHandler} */
module.exports = {
  name: Events.ClientReady,
  once: true,
  /**
   * @param {import('discord.js').Client} client - The ready client (same reference as discordClient).
   * @returns {void}
   */
  execute(client) {
    setIdleStatus(client);
  },
};
