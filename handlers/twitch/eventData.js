/**
 * @module handlers/twitch/eventData
 * @description
 * Adapter that turns Twurple's raw `onMessage` arguments into a stable
 * {@link TwitchEventData} object so per-platform handlers don't depend on the
 * exact Twurple shape. Adds a `self` flag that is true when the message comes
 * from the bot account itself.
 *
 * @typedef {import('../../utils/types').TwitchEventData} TwitchEventData
 */

"use strict";

/**
 * Build a normalised event payload from Twurple's `onMessage` arguments.
 *
 * @param {string} channel - Twitch channel name the message arrived on.
 * @param {string} user - Lower-case username of the sender.
 * @param {string} message - Raw chat text.
 * @param {import('@twurple/chat').ChatMessage} msg - Underlying Twurple message object.
 * @returns {TwitchEventData}
 */
function createEventData(channel, user, message, msg) {
  return {
    channel: channel,
    user: {
      name: user,
      id: msg.userInfo.userId,
      displayName: msg.userInfo.displayName,
    },
    message: {
      content: message,
      id: msg.id,
      isCheer: msg.isCheer,
      bits: msg.bits || 0,
      emotes: msg.emotes,
    },
    flags: {
      mod: msg.userInfo.isMod,
      broadcaster: msg.userInfo.isBroadcaster,
      subscriber: msg.userInfo.isSubscriber,
      vip: msg.userInfo.isVip,
      founder: msg.userInfo.isFounder,
      staff: msg.userInfo.isStaff,
    },
    timestamp: new Date(),
    self:
      msg.userInfo.userName.toLowerCase() ===
      process.env.TWITCH_USERNAME.toLowerCase(),
    rawData: msg,
  };
}

module.exports = { createEventData };
