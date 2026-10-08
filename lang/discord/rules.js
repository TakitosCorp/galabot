/**
 * @module lang/discord/rules
 * @description
 * Localised string tables consumed by {@link module:commands/discord/rules}.
 * Provides the bilingual rules embed contents (`rulesTitle`, `rulesFields`,
 * `rulesFooter`) plus DM/fallback copy used when the rules are sent to a
 * specific user.
 */

export default {
  en: {
    rulesChannelFallback: "the rules channel",
    reminderTitle: (username) => `Reminder for ${username}`,
    reminderDesc: (rulesChannel) =>
      `I've been asked to remind you to read the rules. Head over to ${rulesChannel} to read them.`,
    dmSuccess: (tag) => `✅ Reminder sent to ${tag} via DM.`,
    dmFallback: (id, rulesChannel) =>
      `Hey <@${id}>! I couldn't send you a DM, but I've been asked to remind you to read the rules in ${rulesChannel}.`,
    dmFallbackReply: (tag) =>
      `⚠️ Couldn't send DM to ${tag}, notified here instead.`,
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
        name: "★ NO friend requests to Gala",
        value:
          "⋆ Do not send Gala friend requests unless she has approved it or asked for it. Doing so counts as a warning, just like tagging her.",
      },
      {
        name: "★ Be respectful",
        value: "⋆ NO offensive comments toward others!",
      },
      {
        name: "★ No personal or chat spam",
        value:
          "⋆ DO NOT advertise your social media or someone else's. If you want to do so, ask an admin or moderator first!",
      },
      {
        name: "★ DO NOT MAKE ANNOYING NOISES IN VOICE CHANNELS",
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
        name: "★ Offensive usernames or profile pictures are prohibited",
        value:
          "⋆ ˚｡⋆୨୧˚ Keep your usernames and profile pictures appropriate. ˚୨୧⋆｡˚ ⋆",
      },
      {
        name: "★ DO NOT share personal information",
        value: "⋆ Keep everyone's privacy protected.",
      },
      { name: "​", value: "​" },
      {
        name: "≡;- ꒰ ° 3 WARNINGS = BAN ° ꒱",
        value: "This is not negotiable!",
      },
    ],
    nsfwChannelField: (channel) => ({
      name: "★ NSFW channel",
      value: `⋆ In ${channel} you may only post content related to Gala (mention Gala) or content approved by the mods or Gala herself. If you want to post something, always ask a mod first. Do NOT ping Gala.`,
    }),
    rulesFooter: "Thank you for reading the rules, fossil 💜",
    logSent: (username) =>
      `Server rules sent in channel by request of ${username}`,
    logDmSent: (tag, by) => `Rules reminder sent to ${tag} by ${by}`,
    logDmFail: (tag) => `Could not send DM to ${tag}, notified in channel.`,
    logChannelFail: (msg) => `Failed to notify in fallback channel: ${msg}`,
  },
  es: {
    rulesChannelFallback: "el canal de normas",
    reminderTitle: (username) => `Recordatorio para ${username}`,
    reminderDesc: (rulesChannel) =>
      `Se me ha solicitado recordarte que leas las normas. Por favor, revísalas en ${rulesChannel}.`,
    dmSuccess: (tag) => `✅ Recordatorio enviado a ${tag} por mensaje directo.`,
    dmFallback: (id, rulesChannel) =>
      `¡Hola <@${id}>! No he podido enviarte un mensaje directo, pero se me ha pedido que te recuerde leer las normas en ${rulesChannel}.`,
    dmFallbackReply: (tag) =>
      `⚠️ No se pudo enviar el mensaje directo a ${tag}; se le notificó por este medio.`,
    rulesTitle: "¡REGLAS!",
    rulesFields: [
      {
        name: "★ Los mensajes directos de Gala están CERRADOS",
        value:
          "⋆ ˚｡⋆୨୧ ¡Si quieres decirle algo a Gala, puedes escribirle en el servidor! No la etiquetes y sé paciente; lo verá eventualmente. Si necesitas algo urgente, contacta a un moderador.",
      },
      {
        name: "★ RESPETO",
        value:
          "⋆ Respeta los límites y el espacio personal de la creadora. Recuerda que Gala es una creadora de contenido y nosotros somos sus seguidores. ¡No cruces la línea!",
      },
      {
        name: "★ NO envíes solicitudes de amistad a Gala",
        value:
          "⋆ No le envíes solicitudes de amistad a Gala salvo que ella lo haya aprobado o lo haya pedido. Hacerlo cuenta como una advertencia, igual que etiquetarla.",
      },
      {
        name: "★ Sé respetuoso/a",
        value: "⋆ ¡Sin comentarios ofensivos hacia los demás!",
      },
      {
        name: "★ Sin spam personal o de chat",
        value:
          "⋆ No hagas publicidad de tus redes sociales o las de otros. Si deseas hacerlo, pide permiso a un administrador o moderador primero.",
      },
      {
        name: "★ NO HAGAS RUIDOS MOLESTOS EN CANALES DE VOZ",
        value: "⋆ Mantén los canales de voz respetuosos y claros.",
      },
      {
        name: "★ Prohibido el material pornográfico o NSFW",
        value:
          '⋆ Debes marcar este contenido como "spoiler". Compartir este tipo de contenido resultará en un **BANEO INMEDIATO**.',
      },
      {
        name: "★ El contenido GORE/CP está prohibido",
        value: "⋆ **BANEO INMEDIATO**",
      },
      {
        name: "★ Nombres de usuario o fotos de perfil ofensivos prohibidos",
        value:
          "⋆ ˚｡⋆୨୧˚ Mantén tu nombre de usuario y foto de perfil de forma apropiada. ˚୨୧⋆｡˚ ⋆",
      },
      {
        name: "★ NO compartas información personal",
        value: "⋆ Protege la privacidad de todos.",
      },
      { name: "​", value: "​" },
      {
        name: "≡;- ꒰ ° 3 ADVERTENCIAS = BANEO ° ꒱",
        value: "¡Esto no es negociable!",
      },
    ],
    nsfwChannelField: (channel) => ({
      name: "★ Canal NSFW",
      value: `⋆ En ${channel} solo puedes publicar contenido relacionado con Gala (menciona a Gala) o contenido aprobado por los moderadores o por la propia Gala. Si quieres publicar algo, pregunta siempre antes a un moderador. NO etiquetes a Gala.`,
    }),
    rulesFooter: "Muchas gracias por leer las reglas, fossil 💜",
    logSent: (username) =>
      `Normas del servidor enviadas en el canal por petición de ${username}`,
    logDmSent: (tag, by) => `Recordatorio de normas enviado a ${tag} por ${by}`,
    logDmFail: (tag) =>
      `No se pudo enviar el mensaje directo a ${tag}; notificando en el canal.`,
    logChannelFail: (msg) =>
      `Error al intentar notificar en el canal alternativo: ${msg}`,
  },
};
