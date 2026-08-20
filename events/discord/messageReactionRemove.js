/**
 * @module events/discord/messageReactionRemove
 * @description
 * Reaction role removal handler. When a user removes a reaction from a tracked
 * message, revoke the corresponding role.
 */

import { discordLog } from "../../utils/core/loggers.js";
import {
  parseReactionRoleEnv,
  getTrackedMessage,
  getRoleForEmoji,
} from "../../utils/discord/reactionRoleManager.js";

/** @type {import('../../utils/core/types.js').DiscordEventHandler} */
export const name = "messageReactionRemove";

export async function execute(reaction, user) {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      discordLog("warn", "messageReactionRemove:fetch reaction failed", {
        err: error.message,
      });
      return;
    }
  }

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (error) {
      discordLog("warn", "messageReactionRemove:fetch message failed", {
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
      discordLog("warn", "messageReactionRemove:role not found", {
        roleId,
        guildId: guild.id,
      });
      return;
    }

    await member.roles.remove(
      roleId,
      `Reaction role removed: ${reaction.emoji.name || reaction.emoji.id}`,
    );

    discordLog("info", "messageReactionRemove:role removed", {
      userId: user.id,
      username: user.username,
      roleId,
      roleName: role.name,
      group: row.group_name,
    });
  } catch (error) {
    discordLog("error", "messageReactionRemove:remove failed", {
      userId: user.id,
      roleId,
      messageId: reaction.message.id,
      err: error.message,
    });
  }
}
