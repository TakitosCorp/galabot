/**
 * @module utils/reactionRoleManager
 * @description
 * Utilities for managing persistent reaction roles.
 * Handles emoji-to-role mappings (Unicode and custom Discord emojis),
 * message tracking in database, and role assignment.
 *
 * Env var format: REACTION_ROLE_{GROUP}_EMOJI{N}=emoji:roleId
 * Examples:
 *   REACTION_ROLE_RULES_EMOJI1=🦖:1500087724953047070
 *   REACTION_ROLE_RULES_EMOJI2=<:sauropod:1234567890>:1500087724953047070
 */

import { db } from "../../db/database.js";
import { discordLog } from "../core/loggers.js";

/**
 * Parse REACTION_ROLE_{GROUP}_EMOJI* env vars for a given group.
 * Splits on the last colon so custom emoji format (<:name:id>) is preserved.
 *
 * @param {string} group - Group name in UPPER_CASE (e.g. "RULES", "WELCOME")
 * @returns {Map<string, string>} Map of emoji → roleId
 */
export function parseReactionRoleEnv(group) {
  const emojiMap = new Map();
  const prefix = `REACTION_ROLE_${group}_EMOJI`;
  let count = 1;

  while (process.env[`${prefix}${count}`]) {
    const envValue = process.env[`${prefix}${count}`];
    const lastColon = envValue.lastIndexOf(":");
    const emoji = envValue.substring(0, lastColon);
    const roleId = envValue.substring(lastColon + 1);

    if (!emoji || !roleId) {
      discordLog("warn", "reactionRoleManager:parseEnv invalid format", {
        env: `${prefix}${count}`,
        value: envValue,
      });
      count++;
      continue;
    }

    emojiMap.set(emoji, roleId);
    count++;
  }

  if (emojiMap.size > 0) {
    discordLog("info", "reactionRoleManager:parseEnv loaded", {
      group,
      count: emojiMap.size,
    });
  }

  return emojiMap;
}

/**
 * Get emoji identifier for matching against env var keys.
 * Unicode emoji → returns name. Custom emoji → returns "<:name:id>" or "<a:name:id>".
 *
 * @param {import('discord.js').Emoji | string} emoji
 * @returns {string}
 */
export function getEmojiIdentifier(emoji) {
  if (typeof emoji === "string") {
    return emoji;
  }

  if (emoji.id) {
    const prefix = emoji.animated ? "a" : "";
    return `<${prefix}:${emoji.name}:${emoji.id}>`;
  }

  return emoji.name;
}

/**
 * Find role ID for a reacted emoji within the given map.
 *
 * @param {import('discord.js').Emoji | string} emoji
 * @param {Map<string, string>} emojiMap
 * @returns {string|null}
 */
export function getRoleForEmoji(emoji, emojiMap) {
  const identifier = getEmojiIdentifier(emoji);

  if (emojiMap.has(identifier)) {
    return emojiMap.get(identifier);
  }

  if (emoji.id && emojiMap.has(emoji.id)) {
    return emojiMap.get(emoji.id);
  }

  return null;
}

/**
 * Add bot reactions to a message for every emoji in the map.
 *
 * @async
 * @param {import('discord.js').Message} message
 * @param {Map<string, string>} emojiMap
 * @returns {Promise<void>}
 */
export async function addReactionsToMessage(message, emojiMap) {
  for (const emoji of emojiMap.keys()) {
    try {
      await message.react(emoji);
    } catch (error) {
      discordLog("warn", "reactionRoleManager:react failed", {
        emoji,
        messageId: message.id,
        err: error.message,
      });
    }
  }
}

/**
 * Persist a message in the database as a reaction-role message.
 *
 * @async
 * @param {string} messageId
 * @param {string} channelId
 * @param {string} guildId
 * @param {string} groupName - Uppercase group key (e.g. "RULES")
 * @returns {Promise<void>}
 */
export async function trackMessage(messageId, channelId, guildId, groupName) {
  try {
    await db
      .insertInto("reaction_role_messages")
      .values({
        message_id: messageId,
        channel_id: channelId,
        guild_id: guildId,
        group_name: groupName,
        created_at: new Date().toISOString(),
      })
      .execute();

    discordLog("info", "reactionRoleManager:tracked", {
      messageId,
      channelId,
      guildId,
      groupName,
    });
  } catch (error) {
    discordLog("error", "reactionRoleManager:track failed", {
      messageId,
      err: error.message,
    });
  }
}

/**
 * Return the tracked row for a message, or undefined if not tracked.
 * Callers read `row.group_name` to know which emoji map to use.
 *
 * @async
 * @param {string} messageId
 * @returns {Promise<{message_id: string, group_name: string}|undefined>}
 */
export async function getTrackedMessage(messageId) {
  try {
    return await db
      .selectFrom("reaction_role_messages")
      .select(["message_id", "group_name"])
      .where("message_id", "=", messageId)
      .executeTakeFirst();
  } catch (error) {
    discordLog("error", "reactionRoleManager:getTracked failed", {
      messageId,
      err: error.message,
    });
    return undefined;
  }
}
