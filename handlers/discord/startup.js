const { discordLog: log } = require("../../utils/loggers");
const { Collection } = require("discord.js");
const fs = require("fs").promises;
const path = require("path");

// Bootstraps the Discord client by registering events and commands
async function bootstrap(discordClient) {
  discordClient.commands = new Collection();
  await registerEvents(discordClient);
  await registerCommands(discordClient);
  log("info", "Discord client bootstrapped");
}

// Registers all Discord event handlers from the events/discord directory
async function registerEvents(discordClient) {
  const eventDir = path.join(process.cwd(), "events", "discord");
  const eventFiles = await fs.readdir(eventDir);
  for (const file of eventFiles) {
    if (file.endsWith(".js")) {
      const event = require(path.join(eventDir, file));
      // Use 'once' for one-time events, otherwise use 'on'
      if (event.once) {
        discordClient.once(event.name, (...args) => event.execute(...args, discordClient));
      } else {
        discordClient.on(event.name, (...args) => event.execute(...args, discordClient));
      }
    }
  }
}

// Registers all Discord commands from the commands/discord directory
async function registerCommands(discordClient) {
  const commandDir = path.join(process.cwd(), "commands", "discord");
  const commandFiles = await fs.readdir(commandDir);
  for (const file of commandFiles) {
    if (file.endsWith(".js")) {
      const command = require(path.join(commandDir, file));
      // Store command in the client's command collection
      discordClient.commands.set(command.data.name, command);
    }
  }
}

module.exports = {
  bootstrap,
};
