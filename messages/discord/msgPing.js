const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { discordLog } = require("../../utils/loggers");
const { addWarn, getWarnCount } = require("../../db/warns");

async function handlePing(message) {
  const user = message.author;
  const guildMember = await message.guild.members.fetch(user.id);

  if (!guildMember || guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return;
  }

  const warnCount = await getWarnCount(user.id);

  if (warnCount >= 3) {
    const banEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`Ban emitido para ${user.username}`)
      .addFields(
        { name: "Motivo:", value: "Acumulación de 3 o más advertencias por ping a Gala." },
        { name: "Acciones tomadas:", value: "Baneo permanente del servidor." }
      );

    if (message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
      try {
        await user.send({ embeds: [banEmbed] });
      } catch (e) {
        discordLog("warn", "No se pudo enviar DM de baneo al usuario.");
      }
      try {
        await guildMember.ban({ reason: "Acumulación de advertencias por ping a Gala." });
        await message.channel.send({ embeds: [banEmbed] });
        discordLog("info", `Usuario ${user.username} baneado por acumulación de warns.`);
      } catch (error) {
        discordLog("error", `Fallo al banear a ${user.username}: ${error.message}`);
      }
    }
  } else {
    const reason = "Advertencia por ping innecesario a Gala.";
    await addWarn(user.id, reason);
    const newWarnCount = await getWarnCount(user.id);
    const timeoutDuration = newWarnCount * 10 * 60 * 1000;

    const warnEmbed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`Advertencia y Timeout para ${user.username}`)
      .addFields(
        { name: "Motivo:", value: reason },
        { name: "Total de advertencias:", value: `${newWarnCount}` },
        { name: "Duración del timeout:", value: `${timeoutDuration / 60000} minutos` }
      );

    if (message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      try {
        await user.send({ embeds: [warnEmbed] });
      } catch (e) {
        discordLog("warn", "No se pudo enviar DM de warn/timeout al usuario.");
      }
      try {
        await guildMember.timeout(timeoutDuration, reason);
        await message.channel.send({ embeds: [warnEmbed] });
        discordLog("info", `Timeout aplicado a ${user.username} por ${timeoutDuration / 60000} minutos.`);
      } catch (error) {
        discordLog("error", `Fallo al aplicar timeout a ${user.username}: ${error.message}`);
      }
    }
  }
}

module.exports = { handlePing };
