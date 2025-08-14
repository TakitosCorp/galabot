const { discordLog: log } = require("../../utils/loggers");
const { Collection } = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

async function bootstrap(discordClient, clientManager) {
  discordClient.commands = new Collection();
  await registerEvents(discordClient, clientManager);
  await registerCommands(discordClient);
  log("info", "Bootstrap de Discord completado.");
}

async function registerEvents(discordClient, clientManager) {
  const eventDir = path.join(process.cwd(), "events", "discord");
  const eventFiles = await fs.readdir(eventDir);

  for (const file of eventFiles.filter((f) => f.endsWith(".js"))) {
    const event = require(path.join(eventDir, file));
    const eventName = event.name;

    if (event.once) {
      discordClient.once(eventName, (...args) => event.execute(...args, discordClient, clientManager));
    } else {
      discordClient.on(eventName, (...args) => event.execute(...args, discordClient, clientManager));
    }
  }
}

async function registerCommands(discordClient) {
  const commandDir = path.join(process.cwd(), "commands", "discord");
  const commandFiles = await fs.readdir(commandDir);

  for (const file of commandFiles.filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandDir, file));
    discordClient.commands.set(command.data.name, command);  }
}

module.exports = {
  bootstrap,
};
