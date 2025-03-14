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
              "Para cualquier mensaje dirigido a Gala, utiliza los canales del servidor. No la etiquetes (@) innecesariamente y ten paciencia, ya verá tu mensaje cuando pueda. Si es algo urgente, contacta con un moderador o administrador.",
          },
          {
            name: "❥ PROHIBIDO COQUETEAR O LIGAR CON GALA",
            value:
              "Mantén siempre una actitud de respeto. Este no es un espacio para coqueteos o insinuaciones hacia Gala ni hacia ningún miembro del servidor. Incumplir esta norma conllevará sanciones inmediatas.",
          },
          {
            name: "❥ NO EXIGIRLE NADA A GALA",
            value:
              "Recuerda que Gala es una creadora de contenido y tiene derecho a decidir qué y cuándo interactúa. No demandes su atención ni insistas en cosas que no ha ofrecido. Respetar sus límites es esencial para mantener una relación sana.",
          },
          {
            name: "❥ SÉ RESPETUOSO/A",
            value:
              "Está prohibido realizar comentarios ofensivos, insultos o burlas hacia otros miembros. Todos merecen un trato digno y respetuoso, independientemente de sus opiniones o creencias. Faltar al respeto resultará en sanciones como **warns** o incluso expulsiones.",
          },
          {
            name: "❥ PROHIBIDO EL SPAM",
            value:
              "No inundes los chats con mensajes repetidos, irrelevantes o innecesarios. Tampoco publiques enlaces, promociones personales o de terceros sin autorización explícita del staff.",
          },
          {
            name: "❥ GALA SOLO JUEGA CON SUS SUBS",
            value:
              "Los eventos y partidas organizados por Gala están reservados exclusivamente para sus suscriptores. Si no eres sub, evita pedirle jugar o invitarla a juegos. ¡Respeta esta dinámica!",
          },
          {
            name: "❥ NO SPAMEAR MENSAJES",
            value:
              "Enviar mensajes repetitivos, abusar de las mayúsculas o enviar cadenas de texto en corto tiempo afecta la experiencia del chat. Sé considerado/a y mantén una comunicación clara y ordenada.",
          },
          {
            name: "❥ NO HACER RUIDOS MOLESTOS EN LOS CANALES DE VOZ",
            value:
              "Respeta el ambiente de los canales de voz. Evita gritar, hacer ruidos molestos, reproducir música sin permiso o interrumpir constantemente las conversaciones.",
          },
          {
            name: "❥ PROHIBIDO EL MATERIAL PORNOGRÁFICO O NSFW",
            value:
              'Solo está permitido contenido NSFW relacionado con el **avatar de Gala**, siempre que esté marcado como **"spoiler"** y cumpla con las normas del servidor. Cualquier violación será sancionada con un **BAN INMEDIATO**.',
          },
          {
            name: "❥ PROHIBIDO EL GORE O CONTENIDO ILEGAL",
            value:
              "Está completamente prohibido compartir contenido violento, gore o cualquier material relacionado con la explotación infantil (CP). Cualquier infracción será reportada de forma inmediata a las autoridades competentes.",
          },
          {
            name: "❥ NOMBRES E IMÁGENES DE PERFIL ADECUADOS",
            value:
              "Tu nombre de usuario y avatar deben ser respetuosos. Evita cualquier cosa que pueda considerarse ofensiva, vulgar o inapropiada. Si tienes dudas, consulta con el staff.",
          },
          {
            name: "❥ NO COMPARTAS INFORMACIÓN PERSONAL",
            value:
              "Por tu seguridad, no compartas datos sensibles como direcciones, números de teléfono o contraseñas. Esto también incluye información de terceros sin su consentimiento.",
          },
          {
            name: "❥ SIGUE LAS INSTRUCCIONES DEL STAFF",
            value:
              "El equipo de moderación está aquí para garantizar una convivencia sana. Coopera con ellos, sigue sus indicaciones y respeta sus decisiones en todo momento.",
          },
          {
            name: "❥ DISFRUTA Y PARTICIPA CON RESPETO",
            value:
              "Este servidor está diseñado para que todos disfrutemos juntos. Comparte tus ideas, interactúa con otros y diviértete, siempre desde el respeto y la empatía.",
          },
          { name: "\u200B", value: "\u200B" },
          {
            name: "⚠️ SEREMOS MUY ESTRICTOS ⚠️",
            value: "≡;- ꒰ **3 WARNS = BAN DEL SERVIDOR** ꒱",
          }
        )
        .setImage("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true")
        .setThumbnail("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_knife.png?raw=true")
        .setFooter({
          text: "Muchas gracias por leer las normas, takito 💜",
        });

      const extraEmbed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle("IMPORTANTE: SOBRE GALA Y SU ROL COMO VTUBER")
        .addFields(
          {
            name: "❥ GALA NO ES TU AMIGA",
            value:
              "Tanto los moderadores como los seguidores deben entender que **Gala no es su amiga**. Gala es una creadora de contenido que se esfuerza por entretenernos y ofrecernos horas de diversión. La confianza excesiva o la confusión entre su amabilidad y amistad no son apropiadas. Respetemos los límites.",
          },
          {
            name: "❥ LOS DMs DE GALA ESTÁN CERRADOS POR UNA RAZÓN",
            value:
              "Cuando le escribes por DM, le estás creando una obligación y haciéndola sentir comprometida a responder para evitar conflictos. Por eso, Gala tiene sus mensajes directos cerrados. Si Gala decide abrir un DM contigo, será exclusivamente por un motivo específico. **Esto no significa que puedas hablarle cuando te plazca. Sus DMs siguen estando cerrados.**",
          },
          {
            name: "❥ RESPETA SU PAPEL COMO CREADORA",
            value:
              "Es importante recordar que Gala sigue siendo una creadora de contenido que dedica tiempo y esfuerzo para entretener a su comunidad. Debemos tratarla con el mismo respeto y consideración que merece cualquier profesional, independientemente de su audiencia.",
          },
          {
            name: "❥ SER SUB NO IMPLICA AMISTAD",
            value:
              "Convertirse en sub no te convierte en su amigo. Ser sub significa que decides apoyar a Gala **de manera desinteresada** en su labor como creadora. Que ocasionalmente invite a subs a jugar no implica que se traspase la barrera entre creadora y espectador. Manten siempre un comportamiento respetuoso.",
          },
          {
            name: "⚠️ AVISO FINAL ⚠️",
            value:
              "Si no respetas estas reglas, el equipo de moderación **se verá obligado a tomar medidas disciplinarias** para garantizar un ambiente sano y respetuoso en la comunidad. Recordemos que este es un espacio para disfrutar juntos, siempre con empatía y límites claros.",
          }
        )
        .setImage("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true");

      logger.info(`Normas del servidor enviadas`);
      await interaction.reply({ embeds: [normasEmbed, extraEmbed] });
    }
  },
};
