const { InteractionType, MessageFlags } = require("discord.js");
const { discordLog } = require("../../utils/loggers");
const { getLanguage } = require("../../utils/language");

async function executeCommand(interaction, client, clientManager) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client, clientManager);
  } catch (error) {
    discordLog(
      "error",
      `Error executing command '${interaction.commandName}': ${error.stack}`,
    );

    const lang = getLanguage(interaction.channelId);
    const errorMessage =
      lang === "es"
        ? "Hubo un error al ejecutar este comando."
        : "There was an error while executing this command.";

    const replyOptions = {
      content: errorMessage,
      flags: MessageFlags.Ephemeral,
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
