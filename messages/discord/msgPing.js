/**
 * @module messages/discord/msgPing
 * @description
 * Handles guild messages that mention the streamer's Discord account
 * (`GALA_DISCORD_ID`). Non-administrator pingers receive a warning that scales
 * to a ban once they reach 3 accumulated warnings — the same escalation policy
 * as `/warn`, but triggered automatically rather than by a moderator.
 */

"use strict";

const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { discordLog } = require("../../utils/loggers");
const { addWarn, getWarnCount } = require("../../db/warns");
const strings = require("../../lang/ping");

/**
 * Process a ping aimed at the streamer. Admins are silently ignored. Everyone
 * else accumulates warnings (or is banned outright on the third strike).
 *
 * @async
 * @param {import('discord.js').Message} message - The offending guild message.
 * @param {("en"|"es")} lang - Language resolved from the channel.
 * @returns {Promise<void>}
 */
async function handlePing(message, lang) {
  const t = strings[lang];
  const tEn = strings.en;
  const user = message.author;
  const guildMember = await message.guild.members.fetch(user.id);

  discordLog("debug", "msgPing:handlePing", {
    userId: user.id,
    channelId: message.channelId,
    lang,
  });

  if (
    !guildMember ||
    guildMember.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    discordLog("debug", "msgPing:admin or missing-member, skipping", {
      userId: user.id,
    });
    return;
  }

  const warnCount = await getWarnCount(user.id);

  if (warnCount >= 3) {
    const banEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(t.banTitle(user.username))
      .addFields(
        { name: "Reason:", value: t.banReason },
        { name: "Actions taken:", value: t.banAction },
      );

    if (
      message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)
    ) {
      try {
        await user.send({ embeds: [banEmbed] });
      } catch (e) {
        discordLog("warn", "msgPing:ban-dm failed", {
          userId: user.id,
          err: e.message,
        });
      }
      try {
        await guildMember.ban({ reason: t.banReason });
        await message.channel.send({ embeds: [banEmbed] });
        discordLog("info", "msgPing:banned for repeated pings", {
          userId: user.id,
          username: user.username,
        });
      } catch (error) {
        discordLog("error", "msgPing:ban-api failed", {
          userId: user.id,
          err: error.message,
          stack: error.stack,
        });
      }
    } else {
      discordLog("warn", "msgPing:no-ban-perms", { userId: user.id });
    }
  } else {
    const reason = t.warnReason;
    await addWarn(user.id, reason);
    const newWarnCount = await getWarnCount(user.id);
    const timeoutDuration = newWarnCount * 10 * 60 * 1000;

    const warnEmbed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(t.warnTitle(user.username))
      .addFields(
        { name: "Reason:", value: reason },
        { name: t.warnCount, value: `${newWarnCount}` },
        {
          name: t.timeoutDuration,
          value: t.timeoutMinutes(timeoutDuration / 60000),
        },
      );

    if (
      message.guild.members.me.permissions.has(
        PermissionFlagsBits.ModerateMembers,
      )
    ) {
      try {
        await user.send({ embeds: [warnEmbed] });
      } catch (e) {
        discordLog("warn", "msgPing:warn-dm failed", {
          userId: user.id,
          err: e.message,
        });
      }
      try {
        await guildMember.timeout(timeoutDuration, reason);
        await message.channel.send({ embeds: [warnEmbed] });
        discordLog("info", "msgPing:timeout applied", {
          userId: user.id,
          username: user.username,
          minutes: timeoutDuration / 60000,
          warnCount: newWarnCount,
        });
      } catch (error) {
        discordLog("error", "msgPing:timeout-api failed", {
          userId: user.id,
          err: error.message,
          stack: error.stack,
        });
      }
    } else {
      discordLog("warn", "msgPing:no-timeout-perms", { userId: user.id });
    }
  }
}

module.exports = { handlePing };
