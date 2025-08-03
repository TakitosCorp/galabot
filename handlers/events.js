const { readdirSync } = require("fs");

const messageCreateHandler = require("../events/messageCreate");

module.exports = (discordClient, logger) => {
  const eventFiles = readdirSync("./events").filter((file) => file.endsWith(".js"));

  discordClient.on("messageCreate", (message) => messageCreateHandler(discordClient, message, logger));

  for (const file of eventFiles) {
    try {
      const event = require(`../events/${file}`);
      if (event.once) {
        discordClient.once(event.name, (...args) => event.execute(discordClient, logger, ...args));
      } else {
        discordClient.on(event.name, (...args) => event.execute(discordClient, logger, ...args));
      }
    } catch (error) {
      console.log(error);
      logger.error(`Error al cargar el evento ${file}:`, error);
    }
  }
};
