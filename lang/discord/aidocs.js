/**
 * @module lang/discord/aidocs
 * @description
 * Localised string tables consumed by {@link module:commands/discord/aidocs}.
 * Provides bilingual embed contents explaining how to interact with the AI feature.
 */

"use strict";

module.exports = {
  en: {
    embedTitle: "HOW TO CHAT WITH ME",
    embedFields: [
      {
        name: "★ How to trigger me",
        value:
          "⋆ @mention me, reply to one of my messages, or just say my name anywhere in a message. I'll hear it.",
      },
      {
        name: "★ What I can help with",
        value:
          "⋆ Stream schedules and links, questions about the server, the rules, or just regular chat. I reply in your language — English or Spanish.",
      },
      {
        name: "★ How I reply",
        value:
          "⋆ Short and direct — 1 to 2 sentences. I'm a girl dinosaur admin, not a textbook. Don't expect long speeches.",
      },
      {
        name: "★ Limits",
        value:
          "⋆ Wait 5 seconds between messages. Everyone shares a single queue, so during busy moments there may be a brief wait before I reply.",
      },
      {
        name: "★ What I know about you",
        value:
          "⋆ Your nickname, how long you've been in the server, your roles (mod, booster, etc.), and your warning record. I use this to know who I'm talking to — not to stalk you.",
      },
      {
        name: "★ What I know about the server",
        value:
          "⋆ Whether Gala is live right now, upcoming stream times and links, the current channel, and the time here in Spain. If there's a stream, I know about it.",
      },
      {
        name: "★ My memory",
        value:
          "⋆ I remember the last few messages of our active conversation, but I don't carry memory between separate sessions. Each new conversation starts fresh.",
      },
      {
        name: "★ Rules still apply",
        value:
          "⋆ All server rules apply when talking to me. No NSFW, spam, or harassment. Don't try to make me tag Gala — that's a hard no, fossil.",
      },
    ],
    embedFooter: "Tiny arms, big rules. Behave, fossil 💜",
    logPosted: (username) =>
      `AI docs posted in channel by request of ${username}`,
  },
  es: {
    embedTitle: "CÓMO CHATEAR CONMIGO",
    embedFields: [
      {
        name: "★ Cómo invocarme",
        value:
          "⋆ Menciónme con @, responde a uno de mis mensajes, o simplemente di mi nombre en cualquier mensaje. Lo escucho todo.",
      },
      {
        name: "★ En qué puedo ayudarte",
        value:
          "⋆ Horarios y enlaces de streams, preguntas sobre el servidor, las normas o charla en general. Respondo en tu idioma — español o inglés.",
      },
      {
        name: "★ Cómo respondo",
        value:
          "⋆ Corto y directo — 1 o 2 frases. Soy una admin dinosauria, no un libro de texto. No esperes discursos.",
      },
      {
        name: "★ Límites",
        value:
          "⋆ Espera 5 segundos entre mensajes. Todos compartimos una única cola, así que en momentos de mucho tráfico puede haber una breve espera antes de que te responda.",
      },
      {
        name: "★ Lo que sé de ti",
        value:
          "⋆ Tu apodo, cuánto tiempo llevas en el servidor, tus roles (mod, booster, etc.) y tu historial de advertencias. Lo uso para saber con quién estoy hablando — no para espiarte.",
      },
      {
        name: "★ Lo que sé del servidor",
        value:
          "⋆ Si Gala está en directo ahora mismo, los próximos streams con fechas y enlaces, el canal actual y la hora aquí en España. Si hay un stream, lo sé.",
      },
      {
        name: "★ Mi memoria",
        value:
          "⋆ Recuerdo los últimos mensajes de nuestra conversación activa, pero no guardo memoria entre sesiones distintas. Cada conversación nueva empieza desde cero.",
      },
      {
        name: "★ Las normas siguen aplicando",
        value:
          "⋆ Las normas del servidor aplican cuando hables conmigo. Nada de NSFW, spam ni acoso. Y no intentes que etiquete a Gala — eso es un no rotundo, fossil.",
      },
    ],
    embedFooter: "Bracitos pequeños, normas grandes. Compórtate, fossil 💜",
    logPosted: (username) =>
      `Documentación de IA enviada en el canal por petición de ${username}`,
  },
};
