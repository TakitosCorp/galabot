const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const { addWarn, getWarnCount } = require("../../db/warns");
const discordLog = require("../../utils/loggers").discordLog;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Añade una advertencia a un usuario.")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("El usuario al que deseas advertir").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("motivo").setDescription("El motivo de la advertencia").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(client, interaction, logger) {
    const user = interaction.options.getUser("usuario");
    const reason = interaction.options.getString("motivo");
    const guildMember = interaction.guild.members.cache.get(user.id);
    const warnCount = await getWarnCount(usuario.id);

    // Check if the user exists
    if (!guildMember) {
      return interaction.reply({
        content: "El usuario no se encuentra en el servidor.",
        ephemeral: true,
      });
    }

    // Check if the user is an admin
    if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "No puedes advertir a un administrador.",
        ephemeral: true,
      });
    }

    // Handle the command
    if (warnCount >= 3) {
      handleBan(interaction, user, guildMember);
    } else {
      handleWarn(interaction, user, guildMember, reason);
    }
  },
};

// Handle the ban case where the user has more than 3 warns
async function handleBan(interaction, user, guildMember) {
  // We construct the ban embed, generic to send to user and reply to interaction
  const banEmbed = new EmbedBuilder().setColor(0xff0000).setTitle(`Ban emitido para ${user.username}`).addFields(
    {
      name: "Motivo:",
      value: "Este usuario ha acomulado 3 advertencias.",
    },
    {
      name: "Acciones tomadas:",
      value: "Se ha baneado al usuario del servidor permanentemente.",
    }
  );

  // Let's try to ban the user
  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers) && guildMember) {
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
      await interaction.reply({ embeds: [banEmbed], ephemeral: true });
    } catch (error) {
      discordLog("error", `El baneo del usuario ${user.username} ha fallado`);
      await interaction.reply(`El baneo automático por acomulación de warns del usuario ${user.username} ha fallado`);
    }
  }
}

// Handle the case where the user has less than 3 warns
async function handleWarn(interaction, user, guildMember, reason) {
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
  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers) && guildMember) {
    try {
      await guildMember.timeout(timeoutDuration, reason);
      discordLog("info", `Timeout de ${timeoutDuration / 60000} minutos aplicado a ${user.username}`);
      await interaction.reply({ embeds: [warnTimeoutEmbed], ephemeral: true });
    } catch (error) {
      discordLog("error", `El timeout del usuario ${user.username} ha fallado`);
      await interaction.reply({
        content: `El timeout automático del usuario ${user.username} ha fallado.`,
        ephemeral: true,
      });
    }
  }
}
