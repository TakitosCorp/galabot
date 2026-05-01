module.exports = {
  en: {
    reminderTitle: (username) => `Reminder for ${username}`,
    reminderDesc: `I've been asked to remind you to read the rules. Head over to <#1080660073858220147> to read them.`,
    dmSuccess: (tag) => `✅ Reminder sent to ${tag} via DM.`,
    dmFallback: (id) =>
      `Hey <@${id}>! I couldn't send you a DM, but I've been asked to remind you to read the rules in <#1080660073858220147>.`,
    dmFallbackReply: (tag) => `⚠️ Couldn't send DM to ${tag}, notified here instead.`,
    rulesTitle: "RULES!",
    rulesFields: [
      {
        name: "★ Gala's DMs are CLOSED",
        value:
          "⋆ ˚｡⋆୨୧ If you want to say something to Gala, you can message her on the server! Don't tag her, be patient, she'll see it eventually! If you need something urgently, contact a mod.",
      },
      {
        name: "★ RESPECT",
        value:
          "⋆ Respect the creator's boundaries and personal space. Remember that Gala is a content creator and we are her followers. Don't cross any lines!",
      },
      {
        name: "★ Be respectful",
        value: "⋆ NO offensive comments toward others!",
      },
      {
        name: "★ No personal or chat spam",
        value:
          "⋆ DO NOT advertise your social media or someone else's, if you want to do so, ask an admin or moderator first!",
      },
      {
        name: "★ DO NOT MAKE ANNOYING NOISES OR SIMILAR THINGS IN VOICE CHANNELS",
        value: "⋆ Keep voice channels respectful and clear.",
      },
      {
        name: "★ Pornographic or NSFW material is prohibited",
        value:
          '⋆ You must mark such content as a "spoiler." Sharing this type of content will result in an **IMMEDIATE BAN**.',
      },
      {
        name: "★ GORE/CP is prohibited",
        value: "⋆ **IMMEDIATE BAN**",
      },
      {
        name: "★ Offensive usernames and/or profile pictures are prohibited",
        value:
          "⋆ ˚｡⋆୨୧˚ Keep your usernames and profile pictures appropriate. ˚୨୧⋆｡˚ ⋆",
      },
      {
        name: "★ DO NOT share your or others personal information",
        value: "⋆ Keep everyone's privacy protected.",
      },
      { name: "​", value: "​" },
      { name: "≡;- ꒰ ° 3 WARNINGS = BAN ° ꒱", value: "This is not negotiable!" },
    ],
    rulesFooter: "Thank you for reading the rules, takito 💜",
    logSent: (username) => `Server rules sent in channel by request of ${username}`,
    logDmSent: (tag, by) => `Rules reminder sent to ${tag} by ${by}`,
    logDmFail: (tag) => `Could not send DM to ${tag}, notified in channel.`,
    logChannelFail: (msg) => `Failed to notify in fallback channel: ${msg}`,
  },
  es: {
    reminderTitle: (username) => `Recordatorio para ${username}`,
    reminderDesc: `Me han pedido que te recuerde que leas la normativa, ve a <#1080660073858220147> a leerla.`,
    dmSuccess: (tag) => `✅ Recordatorio enviado a ${tag} por DM.`,
    dmFallback: (id) =>
      `¡Hola <@${id}>! No he podido enviarte un DM, pero me han pedido que te recuerde leer las normas en <#1080660073858220147>.`,
    dmFallbackReply: (tag) => `⚠️ No se pudo enviar DM a ${tag}, se le notificó aquí.`,
    rulesTitle: "¡REGLAS!",
    rulesFields: [
      {
        name: "★ Los DMs de Gala están CERRADOS",
        value:
          "⋆ ˚｡⋆୨୧ ¡Si quieres decirle algo a Gala, puedes escribirle en el servidor! No la etiqu etes, sé paciente, ¡lo verá eventualmente! Si necesitas algo urgente, contacta a un mod.",
      },
      {
        name: "★ RESPETO",
        value:
          "⋆ Respeta los límites y el espacio personal de la creadora. Recuerda que Gala es una creadora de contenido y nosotros somos sus seguidores. ¡No cruces las líneas!",
      },
      {
        name: "★ Sé respetuoso/a",
        value: "⋆ ¡SIN comentarios ofensivos hacia otros!",
      },
      {
        name: "★ Sin spam personal o de chat",
        value:
          "⋆ NO hagas publicidad de tu red social o la de otros, ¡si quieres hacerlo, pídele permiso a un admin o moderador primero!",
      },
      {
        name: "★ NO HAGAS RUIDOS MOLESTOS O SIMILARES EN CANALES DE VOZ",
        value: "⋆ Mantén los canales de voz respetuosos y claros.",
      },
      {
        name: "★ Está prohibido material pornográfico o NSFW",
        value:
          '⋆ Debes marcar este contenido como "spoiler". Compartir este tipo de contenido resultará en **BAN INMEDIATO**.',
      },
      {
        name: "★ GORE/CP está prohibido",
        value: "⋆ **BAN INMEDIATO**",
      },
      {
        name: "★ Están prohibidos los nombres de usuario y/o fotos de perfil ofensivos",
        value:
          "⋆ ˚｡⋆୨୧˚ Mantén tu nombre de usuario y foto de perfil apropiados. ˚୨୧⋆｡˚ ⋆",
      },
      {
        name: "★ NO compartas tu información personal ni la de otros",
        value: "⋆ Protege la privacidad de todos.",
      },
      { name: "​", value: "​" },
      { name: "≡;- ꒰ ° 3 ADVERTENCIAS = BAN ° ꒱", value: "¡Esto no es negociable!" },
    ],
    rulesFooter: "Muchas gracias por leer las reglas, takito 💜",
    logSent: (username) => `Normas del servidor enviadas en el canal por petición de ${username}`,
    logDmSent: (tag, by) => `Recordatorio de normas enviado a ${tag} por ${by}`,
    logDmFail: (tag) => `No se pudo enviar DM a ${tag}, notificando en el canal.`,
    logChannelFail: (msg) => `Fallo al intentar notificar en el canal alternativo: ${msg}`,
  },
};
