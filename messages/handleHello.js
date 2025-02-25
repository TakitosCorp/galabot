const emojis = require("../data/emojis.json");
async function handleHello(message, logger) {
  const userName = message.author.username;
  const userMention = `<@${message.author.id}>`;

  const greetings = [
    `¡Hola, ${userName} ${emojis.galabot_happygala}! ¿Cómo te encuentras hoy? ✨`,
    `¡Hey ${userMention} ${emojis.galabot_lurkgala}! ¿Qué tal va tu día?`,
    `¡Buenas, ${userName} ${emojis.galabot_galalightstick}! Espero que todo esté fluyendo bien! 🐙`,
    `¡Holowolo ${userMention} ${emojis.galabot_kissugala1}! Espero que estés teniendo un día estupendo ^^`,
    `¡Hola, ${userName} ${emojis.galabot_happygala}! ¿Listo para pasar un buen rato con los Takitos? (｡♥‿♥｡)`,
    `¡Hey ${userMention} ${emojis.galabot_kissugala1}! Espero que tengas un día espententacular y lleno de energía 🐙`,
    `¡Saludos, ${userMention} ${emojis.galabot_happygala}! Es genial verte por aquí con los demás Takitos (๑>◡<๑)`,
  ];

  const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

  try {
    await message.reply(randomGreeting);
  } catch (error) {
    logger.error("Error al responder al saludo:", error);
  }
}

module.exports = { handleHello };
