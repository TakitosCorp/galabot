/**
 * @module events/discord/messageReactionAdd
 * @description
 * Reaction role handler. When a user reacts to a tracked message,
 * look up the group from the database, find the matching role, and grant it.
 */

import { discordLog } from "../../utils/core/loggers.js";
import {
  parseReactionRoleEnv,
  getTrackedMessage,
  getRoleForEmoji,
} from "../../utils/discord/reactionRoleManager.js";

/** @type {import('../../utils/core/types').DiscordEventHandler} */
export const name = "messageReactionAdd";

export async function execute(reaction, user) {
  if (user.bot) return;

  // Fetch full reaction and message if partial (messages won't be cached after restart)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      discordLog("warn", "messageReactionAdd:fetch reaction failed", {
        err: error.message,
      });
      return;
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      discordLog("warn", "messageReactionAdd:fetch message failed", {
        err: error.message,
      });
      return;
    }
  }

  const row = await getTrackedMessage(reaction.message.id);
  if (!row) return;

  const emojiMap = parseReactionRoleEnv(row.group_name);
  const roleId = getRoleForEmoji(reaction.emoji, emojiMap);
  if (!roleId) return;

  try {
    const guild = reaction.message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      discordLog("warn", "messageReactionAdd:role not found", {
        roleId,
        guildId: guild.id,
      });
      return;
    }

    await member.roles.add(
      roleId,
      `Reaction role: ${reaction.emoji.name || reaction.emoji.id}`,
    );

    discordLog("info", "messageReactionAdd:role granted", {
      userId: user.id,
      username: user.username,
      roleId,
      roleName: role.name,
      group: row.group_name,
    });
  } catch (error) {
    discordLog("error", "messageReactionAdd:grant failed", {
      userId: user.id,
      roleId,
      messageId: reaction.message.id,
      err: error.message,
    });
  }
}
