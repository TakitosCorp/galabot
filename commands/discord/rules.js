const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const { discordLog } = require("../../utils/loggers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reglas")
    .setDescription("Envía las normas a un canal o a un usuario.")
    .addUserOption((option) =>
      option.setName("usuario").setDescription("El usuario al que recordar las normas.").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, client, clientManager) {
    const user = interaction.options.getUser("usuario");

    if (user) {
      const reminderEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(`Recordatorio para ${user.username}`)
        .setDescription(`Me han pedido que te recuerde que leas la normativa, ve a <#1080660073858220147> a leerla.`);

      try {
        await user.send({ embeds: [reminderEmbed] });
        discordLog("info", `Recordatorio de normas enviado a ${user.tag} por ${interaction.user.tag}`);
        await interaction.reply({ content: `✅ Recordatorio enviado a ${user.tag} por DM.`, ephemeral: true });
      } catch (error) {
        discordLog("warn", `No se pudo enviar DM a ${user.tag}, notificando en el canal.`);
        try {
          const channel = await client.channels.fetch(interaction.channelId);
          await channel.send({
            content: `¡Hola <@${user.id}>! No he podido enviarte un DM, pero me han pedido que te recuerde leer las normas en <#1080660073858220147>.`,
          });
          await interaction.reply({
            content: `⚠️ No se pudo enviar DM a ${user.tag}, se le notificó aquí.`,
            ephemeral: true,
          });
        } catch (channelError) {
          discordLog("error", `Fallo al intentar notificar en el canal alternativo: ${channelError.message}`);
        }
      }
    } else {
      const rulesEmbed = new EmbedBuilder()
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
              "Está prohibido realizar comentarios ofensivos, insultos o burlas hacia otros miembros. Todos merecen un trato digno y respetuoso. Faltar al respeto resultará en sanciones como **warns** o incluso expulsiones.",
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
              'Solo está permitido contenido NSFW relacionado con el **avatar de Gala**, siempre que esté marcado como **"spoiler"**. Cualquier violación será sancionada con un **BAN INMEDIATO**.',
          },
          {
            name: "❥ PROHIBIDO EL GORE O CONTENIDO ILEGAL",
            value:
              "Está completamente prohibido compartir contenido violento, gore o cualquier material ilegal. Cualquier infracción será reportada de forma inmediata a las autoridades competentes.",
          },
          {
            name: "❥ NOMBRES E IMÁGENES DE PERFIL ADECUADOS",
            value:
              "Tu nombre de usuario y avatar deben ser respetuosos. Evita cualquier cosa que pueda considerarse ofensiva, vulgar o inapropiada.",
          },
          {
            name: "❥ NO COMPARTAS INFORMACIÓN PERSONAL",
            value:
              "Por tu seguridad, no compartas datos sensibles como direcciones, números de teléfono o contraseñas. Esto también incluye información de terceros sin su consentimiento.",
          },
          {
            name: "❥ SIGUE LAS INSTRUCCIONES DEL STAFF",
            value:
              "El equipo de moderación está aquí para garantizar una convivencia sana. Coopera con ellos, sigue sus indicaciones y respeta sus decisiones.",
          },
          {
            name: "❥ DISFRUTA Y PARTICIPA CON RESPETO",
            value:
              "Este servidor está diseñado para que todos disfrutemos juntos. Comparte tus ideas, interactúa con otros y diviértete, siempre desde el respeto y la empatía.",
          },
          { name: "\u200B", value: "\u200B" },
          { name: "⚠️ SEREMOS MUY ESTRICTOS ⚠️", value: "≡;- ꒰ **3 WARNS = BAN DEL SERVIDOR** ꒱" }
        )
        .setImage("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true")
        .setThumbnail("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_knife.png?raw=true")
        .setFooter({ text: "Muchas gracias por leer las normas, takito 💜" });

      const extraEmbed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle("IMPORTANTE: SOBRE GALA Y SU ROL COMO VTUBER")
        .addFields(
          {
            name: "❥ GALA NO ES TU AMIGA",
            value:
              "Tanto los moderadores como los seguidores deben entender que **Gala no es su amiga**. Es una creadora de contenido que se esfuerza por entretenernos. La confianza excesiva o confundir su amabilidad con amistad no es apropiado. Respetemos los límites.",
          },
          {
            name: "❥ LOS DMs DE GALA ESTÁN CERRADOS POR UNA RAZÓN",
            value:
              "Cuando le escribes por DM, le estás creando una obligación. Por eso, sus mensajes directos están cerrados. Si Gala decide abrir un DM contigo, será por un motivo específico. **Esto no significa que puedas hablarle cuando quieras. Sus DMs siguen cerrados.**",
          },
          {
            name: "❥ RESPETA SU PAPEL COMO CREADORA",
            value:
              "Gala dedica tiempo y esfuerzo para entretener a su comunidad. Debemos tratarla con el mismo respeto que merece cualquier profesional.",
          },
          {
            name: "❥ SER SUB NO IMPLICA AMISTAD",
            value:
              "Ser sub significa que apoyas a Gala **de manera desinteresada**. Que ocasionalmente invite a subs a jugar no traspasa la barrera entre creadora y espectador. Mantén siempre un comportamiento respetuoso.",
          },
          {
            name: "⚠️ AVISO FINAL ⚠️",
            value:
              "Si no respetas estas reglas, el equipo de moderación **tomará medidas disciplinarias** para garantizar un ambiente sano y respetuoso.",
          }
        )
        .setImage("https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true");

      discordLog("info", `Normas del servidor enviadas en el canal por petición de ${interaction.user.username}`);
      await interaction.reply({ embeds: [rulesEmbed, extraEmbed] });
    }
  },
};
