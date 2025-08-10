const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const resources = require("../../data/resources.json");
const { addWarn, getWarnCount } = require("../../db/warns");
const discordLog = require("../../utils/loggers").discordLog;

module.exports = async function (message, client) {
  const user = message.author;
  const guildMember = await message.guild.members.fetch(user.id);
  const warnCount = await getWarnCount(user.id);

  // Check if the user exists
  if (!guildMember) {
    return await message.reply({
      content: "El usuario no se encuentra en el servidor",
      ephemeral: true,
    });
  }

  // Check if the user is an admin
  if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
    return;
  }

  // Handle the ping
  if (warnCount >= 3) {
    await handleBan(message, user, guildMember);
  } else {
    await handleWarn(message, user, guildMember);
  }
};

async function handleBan(message, user, guildMember) {
  // Construct the ban embed, generic to send to user and reply to interaction
  const banEmbed = new EmbedBuilder().setColor(0xff0000).setTitle(`Ban emitido para ${user.username}`).addFields(
    {
      name: "Motivo:",
      value: "Este usuario ha acomulado 3 advertencias",
    },
    {
      name: "Acciones tomadas:",
      value: "Se ha baneado al usuario del servidor permanentemente",
    }
  );

  // Let's try to ban the user
  if (message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers) && guildMember) {
    // Let's send the ban message
    try {
      await user.send({
        embeds: [banEmbed],
      });
      discordLog("info", `Se ha intentado el envío del embed al usuario ${user.username}`);
    } catch (error) {
      discordLog("error", `El envío del embed ha fallado para el usuario ${user.username}`);
    }

    // Let's ban the user
    try {
      await guildMember.ban({ reason: "Has acomulado más de 3 warns en el servidor" });
      discordLog("info", `Se ha intentado el envío del embed al usuario ${user.username}`);
      await message.channel.send({ embeds: [banEmbed] });
    } catch (error) {
      discordLog("error", `El baneo del usuario ${user.username} ha fallado`);
      await message.channel.send(
        `El baneo automático por acomulación de warns del usuario ${user.username} ha fallado`
      );
    }
  }
}

async function handleWarn(message, user, guildMember) {
  // Set the reason
  const reason = "Advertencia por incumplimiento de la primera norma del servidor";

  // Add the warning to the database
  await addWarn(user.id, reason);

  // Get the total number of warnings for the user
  const warnCount = await getWarnCount(user.id);

  // Calculate timeout duration
  let timeoutDuration = warnCount * 10 * 60 * 1000;

  // Construct a single embed for both warning and timeout
  const warnTimeoutEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(`Advertencia y timeout emitidos para ${user.username}`)
    .addFields(
      { name: "Motivo:", value: reason },
      { name: "Total de advertencias:", value: `${warnCount}` },
      { name: "Duración del timeout:", value: `${timeoutDuration / 60000} minutos` }
    );

  // Try to send the embed to the user
  try {
    await user.send({ embeds: [warnTimeoutEmbed] });
    discordLog("info", `Se ha intentado el envío del embed de advertencia/timeout al usuario ${user.username}`);
  } catch (error) {
    discordLog("error", `El envío del embed de advertencia/timeout ha fallado para el usuario ${user.username}`);
  }

  // Try to apply the timeout and reply with embed
  if (message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers) && guildMember) {
    try {
      await guildMember.timeout(timeoutDuration, reason);
      discordLog("info", `Timeout de ${timeoutDuration / 60000} minutos aplicado a ${user.username}`);
      await message.channel.send({ embeds: [warnTimeoutEmbed] });
    } catch (error) {
      discordLog("error", `El timeout del usuario ${user.username} ha fallado`);
      await message.channel.send(
        `El timeout automático por acomulación de warns del usuario ${user.username} ha fallado`
      );
    }
  }
}
