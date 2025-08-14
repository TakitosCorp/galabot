const { twitchLog } = require("../../utils/loggers");
const resources = require("../../data/resources.json");
const { getLastGreeting, updateGreeting } = require("../../db/greetings");

async function handleHello(eventData, clientManager) {
  const { user, channel } = eventData;
  const { twitchChatClient } = clientManager;
  
  const lastGreeting = await getLastGreeting(user.id);
  if (lastGreeting && new Date(lastGreeting.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000) {
    twitchLog("info", `Usuario ${user.name} (${user.id}) ya fue saludado recientemente en Twitch.`);
    return;
  }

  const userMention = `@${user.displayName || user.name}`;
  const greetingResponses = resources.greetingResponses || [];
  
  const greetings = greetingResponses
    .filter((greeting) => typeof greeting === "string" && greeting.trim().length > 0)
    .map((greeting) => {
      return greeting
        .replace("{userName}", user.name)
        .replace("{userMention}", userMention)
        .replace(/\{emojis\.[^}]+\}/g, ""); 
    });

  const randomGreeting = greetings.length > 0
      ? greetings[Math.floor(Math.random() * greetings.length)]
      : `¡Hola ${userMention}! ¡Bienvenido/a al canal!`;

  try {
    await twitchChatClient.say(channel, randomGreeting);
    await updateGreeting(user.id, new Date().toISOString());
    twitchLog("info", `Saludo enviado a ${user.name} en Twitch.`);
  } catch (error) {
    twitchLog("error", `No se pudo enviar el saludo en Twitch: ${error.message}`);
  }
}

module.exports = async function (eventData, clientManager) {
  if (eventData.self) return;

  const content = eventData.message.content.toLowerCase().trim();
  const isGreeting = resources.greetings.some((greeting) => new RegExp(`^${greeting}$`, "i").test(content) || new RegExp(`\\b${greeting}\\b`, "i").test(content));

  if (isGreeting) {
    await handleHello(eventData, clientManager);
  }
};