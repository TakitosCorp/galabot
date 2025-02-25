const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  InteractionContextType,
} = require("discord.js");
const emojis = require("../../data/emojis.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("normas")
    .setDescription("Envia las normas del servidor")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("El usuario al que deseas recordar las normas").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(client, interaction, logger) {
    const usuario = interaction.options.getUser("usuario");

    if (usuario) {
      const reminderEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(`Recordatorio para ${usuario.username}`)
        .setDescription(
          `Me han pedido que te recuerde que leas la normativa, ve a <#1080660073858220147> a leerla ${emojis.galabot_galanotas}`
        );

      try {
        await usuario.send({ embeds: [reminderEmbed] });
        logger.info(`Recordatorio de normas enviado a ${usuario.tag} por ${interaction.user.tag}`);
      } catch (error) {
        const channel = await client.channels.fetch("1080660073858220150");
        const mentionEmbed = new EmbedBuilder()
          .setColor(0x800080)
          .setTitle(`Recordatorio para ${usuario.username}`)
          .setDescription(
            `¡Hola <@${usuario.id}>! Me han pedido que te recuerde que leas la normativa, ve a <#1080660073858220147> a leerla ${emojis.galabot_galanotas}.`
          );

        await channel.send({ content: `<@${usuario.id}>`, embeds: [mentionEmbed] });
        logger.info(`Recordatorio de normas enviado al canal porque los DMs de ${usuario.tag} están cerrados`);
      }

      await interaction.reply({ content: `Hecho! ${emojis.galabot_galanotas}`, flags: MessageFlags.Ephemeral });
    } else {
      const normasEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle("REGLAS DEL SERVIDOR 💜")
        .addFields(
          {
            name: "❥ LOS DMs DE GALA ESTÁN CERRADOS",
            value:
              "Si quieres decirle algo a Gala, comunícalo por el servidor. No le hagas tag o @, ten paciencia, ya lo verá. Si es urgente, contacta con un moderador.",
          },
          {
            name: "❥ PROHIBIDO COQUETEAR O LIGAR CON GALA",
            value: "Es fundamental mantener el respeto en todo momento.",
          },
          {
            name: "❥ NO EXIGIRLE NADA A GALA",
            value:
              "Respeta los límites y distancias con la creadora. Recuerda que Gala es una creadora de contenido y nosotros somos sus seguidores. No te excedas con las confianzas.",
          },
          {
            name: "❥ SÉ RESPETUOSO/A",
            value:
              "Nada de comentarios ofensivos hacia los demás. No sabes cómo le puede afectar a otra persona. Cualquier falta de respeto será penalizada con un warn/aviso.",
          },
          {
            name: "❥ PROHIBIDO EL SPAM",
            value: "No publiques tus redes o las de otras personas sin el permiso de un administrador o moderador.",
          },
          {
            name: "❥ GALA SOLO JUEGA CON SUS SUBS",
            value: "Gala realizará eventos solo para sus subs. No le pidas jugar si no eres uno de ellos.",
          },
          { name: "❥ NO SPAMEAR MENSAJES", value: "Evita enviar mensajes repetitivos o innecesarios en el chat." },
          {
            name: "❥ NO HACER RUIDOS MOLESTOS EN LOS CANALES DE VOZ",
            value: "Respeta el espacio de los demás en los canales de voz.",
          },
          {
            name: "❥ PROHIBIDO EL MATERIAL PORNOGRÁFICO O NSFW",
            value:
              'Solo se permite contenido NSFW relacionado con el avatar de Gala, y debe estar marcado como **"spoiler"**. Cualquier violación de esta norma será un **BAN DIRECTO**.',
          },
          {
            name: "❥ PROHIBIDO EL GORE/CP",
            value: "Cualquier tipo de contenido gore o de explotación infantil (CP) está estrictamente prohibido.",
          },
          {
            name: "❥ PROHIBIDO LOS NOMBRES E IMÁGENES DE PERFIL OFENSIVOS",
            value: "Mantén un comportamiento adecuado. Evita nombres o imágenes de perfil que sean inapropiados.",
          },
          {
            name: "❥ NO COMPARTAS TUS DATOS PERSONALES",
            value:
              "No compartas tu información personal ni la de otros sin consentimiento. Esto incluye números de teléfono, direcciones, etc.",
          },
          { name: "\u200B", value: "\u200B" },
          { name: "⚠️ SEREMOS MUY ESTRICTOS ⚠️", value: "≡;- ꒰ **3 WARNS = BAN DEL SERVIDOR** ꒱" }
        )
        .setImage("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true")
        .setThumbnail("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_knife.png?raw=true")
        .setFooter({ text: "Muchas gracias por leer las normas, takito 💜" });

      logger.info(`Normas del servidor enviadas`);
      await interaction.reply({ embeds: [normasEmbed] });
    }
  },
};
