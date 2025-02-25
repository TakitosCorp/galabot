const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const warnsFilePath = path.join(__dirname, "../../data/warns.json");
const emojis = require("../../data/emojis.json");

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
    const usuario = interaction.options.getUser("usuario");
    const motivo = interaction.options.getString("motivo");
    const guildMember = interaction.guild.members.cache.get(usuario.id);

    const warns = getWarns();

    if (!warns[usuario.id]) {
      warns[usuario.id] = { count: 0, warnings: [] };
    }
    warns[usuario.id].count++;
    warns[usuario.id].warnings.push({ timestamp: Date.now(), reason: motivo });

    saveWarns(warns);

    if (warns[usuario.id].count >= 3) {
      await handleBan(interaction, usuario, guildMember, logger);
    } else {
      await handleTimeout(interaction, usuario, guildMember, warns[usuario.id].count, motivo, logger);
    }
  },
};

function getWarns() {
  return fs.existsSync(warnsFilePath) ? JSON.parse(fs.readFileSync(warnsFilePath, "utf8")) : {};
}

function saveWarns(warns) {
  fs.writeFileSync(warnsFilePath, JSON.stringify(warns, null, 2), "utf8");
}

function getRandomWarningMessage() {
  const messages = [
    "¡Vaya! ¿No leíste las normas? Timeout pa' ti.",
    "¿Te olvidaste de las reglas? A leerlas durante el timeout.",
    "Uepa, no sabías las normas. Timeout y a repasar.",
    "¡Olvidaste las normas! Ahora, a descansar y leerlas.",
    "¿Te saltaste las normas? Te toca un timeout.",
    "¿No las leíste? Timeout para reflexionar.",
    "¡Ay, que no te enteras! Timeout y a leer las normas.",
    "¿Te olvidaste de leerlas? A tiempo fuera.",
    "Tienes un timeout por no leer las normas. ¡Venga, a repasar!",
    "¿Normas? Timeout para que te pongas al día.",
    "Timeout por no leer las normas. ¡Vuelve cuando las sepas!",
    "Te tocó timeout por no leer las normas, ¡a leerlas ya!",
    "¡A ti te hacía falta un repaso de normas! Timeout.",
    "Venga, ¡a leer las normas durante este timeout!",
    "¿Las normas? Timeout y a repasar, colega.",
  ];

  return Math.random() < 0.1 ? messages[Math.floor(Math.random() * messages.length)] : null;
}

async function handleBan(interaction, usuario, guildMember, logger) {
  const banEmbed = new EmbedBuilder().setColor(0xff0000).setTitle(`Baneo para ${usuario.tag}`).addFields(
    { name: "Motivo", value: "Has acumulado 3 advertencias." },
    {
      name: "Acción",
      value: "Has sido baneado del servidor. Contacta a un administrador si crees que esto es un error.",
    }
  );

  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers) && guildMember) {
    try {
      await usuario.send({ embeds: [banEmbed] });
    } catch (dmError) {
      logger.warn(`No se pudo enviar un mensaje directo a ${usuario.tag}.`);
    }
    await guildMember.ban({ reason: "Acumulación de advertencias" });
    logger.info(`Usuario ${usuario.tag} baneado por acumular 3 advertencias.`);
    await interaction.reply({ embeds: [banEmbed] });
  } else {
    logger.error("El bot no tiene permisos suficientes para banear.");
    await interaction.reply(
      "No se pudo aplicar el ban porque el bot no tiene permisos suficientes. Contacta a un administrador."
    );
  }
}

async function handleTimeout(interaction, usuario, guildMember, count, motivo, logger) {
  const timeoutDuration = count === 1 ? 10 * 60 * 1000 : 20 * 60 * 1000;
  const randomMessage = getRandomWarningMessage();

  const timeoutEmbed = new EmbedBuilder()
    .setColor(0x800080)
    .setTitle(`Advertencia para ${usuario.tag}`)
    .addFields(
      { name: "Motivo", value: motivo },
      {
        name: "Acción",
        value: randomMessage
          ? randomMessage
          : `Te llevas un timeout de ${
              timeoutDuration / 60000
            } minutos. Aprovecha este tiempo para leer las normas del servidor. ${emojis.galabot_galanotas}`,
      }
    );

  if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers) && guildMember) {
    await guildMember.timeout(timeoutDuration, motivo);
    logger.info(`Timeout de ${timeoutDuration / 60000} minutos aplicado a ${usuario.tag}`);
    await interaction.reply({ embeds: [timeoutEmbed] });
  } else {
    logger.error("El bot no tiene permisos suficientes para aplicar un timeout.");
    await interaction.reply(
      "No se pudo aplicar el timeout porque el bot no tiene permisos suficientes. Contacta a un administrador."
    );
  }
}
