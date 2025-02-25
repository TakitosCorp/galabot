const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const fs = require("fs");
const path = require("path");

const formatTimestamp = (timestamp) => `<t:${Math.floor(timestamp / 1000)}:F>`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription("Obtén información sobre un usuario.")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("El usuario del que deseas obtener información").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(client, interaction, logger) {
    const usuario = interaction.options.getUser("usuario");

    const warnsPath = path.resolve(__dirname, "../../data/warns.json");
    const warns = JSON.parse(fs.readFileSync(warnsPath, "utf8"));

    const userWarns = warns[usuario.id] || { count: 0, warnings: [] };

    const infoEmbed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle(`Información de ${usuario.username}`)
      .setThumbnail(usuario.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "ID del Usuario", value: usuario.id, inline: false },
        { name: "Tag", value: usuario.tag, inline: false },
        { name: "Número de advertencias", value: userWarns.count.toString(), inline: false },
        {
          name: "Advertencias",
          value:
            userWarns.warnings.map((w) => `Fecha: ${formatTimestamp(w.timestamp)}, Razón: ${w.reason}`).join("\n") ||
            "No tiene advertencias",
          inline: false,
        }
      )
      .setTimestamp();

    logger.info(`Información de ${usuario.tag} obtenida por ${interaction.user.tag}`);
    await interaction.reply({ embeds: [infoEmbed] });
  },
};
