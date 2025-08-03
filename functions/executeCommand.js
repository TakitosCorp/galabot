const { MessageFlags } = require("discord.js");

async function executeCommand(discordClient, interaction, logger) {
  const command = discordClient.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(discordClient, interaction, logger);
  } catch (error) {
    console.error(error);
    console.log(interaction.options);
    logger.error(`Error ejecutando el comando ${interaction.commandName}:`, error);
    await interaction.reply({ content: "Hubo un error al ejecutar este comando.", flags: MessageFlags.Ephemeral });
  }
}

module.exports = executeCommand;
