const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const { addWarn, getWarnCount } = require("../../db/warns");
const { discordLog } = require("../../utils/loggers");

async function handleBan(interaction, user, guildMember) {
  const banEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`Ban emitido para ${user.username}`)
    .addFields(
      { name: "Motivo:", value: "Acumulación de 3 o más advertencias." },
      { name: "Acciones tomadas:", value: "Baneo permanente del servidor." }
    );

  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
    try {
      await user.send({ embeds: [banEmbed] });
    } catch (error) {
      discordLog("warn", `No se pudo enviar el DM de baneo a ${user.username}.`);
    }

    try {
      await guildMember.ban({ reason: "Acumulación de 3 o más advertencias." });
      await interaction.reply({ embeds: [banEmbed] });
      discordLog("info", `Usuario ${user.username} baneado por acumulación de warns por ${interaction.user.username}.`);
    } catch (error) {
      discordLog("error", `Fallo al banear a ${user.username}: ${error.message}`);
      await interaction.reply({ content: `❌ El baneo de ${user.username} ha fallado.`, ephemeral: true });
    }
  } else {
    await interaction.reply({ content: `❌ No tengo permisos para banear miembros.`, ephemeral: true });
  }
}

async function handleWarn(interaction, user, guildMember, reason) {
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

  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    try {
      await user.send({ embeds: [warnEmbed] });
    } catch (error) {
      discordLog("warn", `No se pudo enviar el DM de advertencia a ${user.username}.`);
    }

    try {
      await guildMember.timeout(timeoutDuration, reason);
      await interaction.reply({ embeds: [warnEmbed] });
      discordLog(
        "info",
        `Timeout de ${timeoutDuration / 60000}m aplicado a ${user.username} por ${interaction.user.username}.`
      );
    } catch (error) {
      discordLog("error", `Fallo al aplicar timeout a ${user.username}: ${error.message}`);
      await interaction.reply({ content: `❌ El timeout para ${user.username} ha fallado.`, ephemeral: true });
    }
  } else {
    await interaction.reply({
      content: `❌ No tengo permisos para aplicar timeouts (moderar miembros).`,
      ephemeral: true,
    });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("advertencia")
    .setDescription("Añade una advertencia a un usuario y le aplica un timeout.")
    .addUserOption((option) => option.setName("usuario").setDescription("El usuario a advertir.").setRequired(true))
    .addStringOption((option) =>
      option.setName("motivo").setDescription("El motivo de la advertencia.").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, client, clientManager) {
    const user = interaction.options.getUser("usuario");
    const reason = interaction.options.getString("motivo");
    const guildMember = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!guildMember) {
      return interaction.reply({ content: "El usuario no se encuentra en este servidor.", ephemeral: true });
    }
    if (user.bot) {
      return interaction.reply({ content: "No puedes advertir a un bot.", ephemeral: true });
    }
    if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "No puedes advertir a un administrador.", ephemeral: true });
    }
    if (user.id === interaction.user.id) {
      return interaction.reply({ content: "No te puedes advertir a ti mismo.", ephemeral: true });
    }

    const currentWarns = await getWarnCount(user.id);

    if (currentWarns >= 3) {
      await handleBan(interaction, user, guildMember);
    } else {
      await handleWarn(interaction, user, guildMember, reason);
    }
  },
};
