const { readdirSync } = require("fs");

const messageCreateHandler = require("../events/messageCreate");

module.exports = (client, logger) => {
  const eventFiles = readdirSync("./events").filter((file) => file.endsWith(".js"));

  client.on("messageCreate", (message) => messageCreateHandler(client, message, logger));

  for (const file of eventFiles) {
    try {
      const event = require(`../events/${file}`);
      if (event.once) {
        client.once(event.name, (...args) => event.execute(client, logger, ...args));
      } else {
        client.on(event.name, (...args) => event.execute(client, logger, ...args));
      }
    } catch (error) {
      logger.error(`Error al cargar el evento ${file}:`, error);
    }
  }
};
