const executeCommand = require("../functions/executeCommand.js");
const { InteractionType } = require("discord.js");

module.exports = {
  name: "interactionCreate",
  async execute(discordClient, logger, interaction) {
    if (interaction.type === InteractionType.ApplicationCommand) executeCommand(discordClient, interaction, logger);
  },
};
