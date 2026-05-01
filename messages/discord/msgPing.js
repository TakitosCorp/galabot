const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { discordLog } = require("../../utils/loggers");
const { addWarn, getWarnCount } = require("../../db/warns");
const strings = require("../../lang/ping");

async function handlePing(message, lang) {
  const t = strings[lang];
  const user = message.author;
  const guildMember = await message.guild.members.fetch(user.id);

  if (!guildMember || guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return;
  }

  const warnCount = await getWarnCount(user.id);

  if (warnCount >= 3) {
    const banEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(t.banTitle(user.username))
      .addFields(
        { name: "Reason:", value: t.banReason },
        { name: "Actions taken:", value: t.banAction }
      );

    if (message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      try {
        await user.send({ embeds: [banEmbed] });
      } catch (e) {
        discordLog("warn", t.dmFailBan);
      }
      try {
        await guildMember.ban({ reason: t.banReason });
        await message.channel.send({ embeds: [banEmbed] });
        discordLog("info", `User ${user.username} banned for accumulated warns.`);
      } catch (error) {
        discordLog("error", `Failed to ban ${user.username}: ${error.message}`);
      }
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
        { name: t.timeoutDuration, value: t.timeoutMinutes(timeoutDuration / 60000) }
      );

    if (message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      try {
        await user.send({ embeds: [warnEmbed] });
      } catch (e) {
        discordLog("warn", t.dmFailWarn);
      }
      try {
        await guildMember.timeout(timeoutDuration, reason);
        await message.channel.send({ embeds: [warnEmbed] });
        discordLog("info", `Timeout applied to ${user.username} for ${timeoutDuration / 60000} minutes.`);
      } catch (error) {
        discordLog("error", `Failed to apply timeout to ${user.username}: ${error.message}`);
      }
    }
  }
}

module.exports = { handlePing };
