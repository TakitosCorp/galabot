const { InteractionType, MessageFlags } = require("discord.js");
const { discordLog } = require("../../utils/loggers");

async function executeCommand(interaction, client, clientManager) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client, clientManager);
  } catch (error) {
    discordLog("error", `Error ejecutando el comando '${interaction.commandName}': ${error.stack}`);

    const replyOptions = {
      content: "Hubo un error al ejecutar este comando.",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client, clientManager) {
    if (interaction.type === InteractionType.ApplicationCommand) {
      await executeCommand(interaction, client, clientManager);
    }
  },
};
