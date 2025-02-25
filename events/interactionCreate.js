const executeCommand = require("../functions/executeCommand.js");
const { InteractionType } = require("discord.js");

module.exports = {
  name: "interactionCreate",
  async execute(client, logger, interaction) {
    if (interaction.type === InteractionType.ApplicationCommand) executeCommand(client, interaction, logger);
  },
};
