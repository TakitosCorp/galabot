const { readdirSync, readdir } = require("fs");

const categories = readdirSync("./commands");

module.exports = (client, logger) => {
  categories.forEach((category) => {
    readdir(`./commands/${category}`, (err) => {
      if (err) return logger.error(err);
      const commands = readdirSync(`./commands/${category}`).filter((archivo) => archivo.endsWith(".js"));
      for (const archivo of commands) {
        try {
          const command = require(`../commands/${category}/${archivo}`);
          client.commands.set(command.data.name, command);
          command.logger = logger;
        } catch (error) {
          console.log(error);
          logger.error(`Error al cargar el comando ${archivo}:`, error);
        }
      }
    });
  });
};
