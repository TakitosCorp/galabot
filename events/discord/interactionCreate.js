const { InteractionType, MessageFlags } = require("discord.js");

async function executeCommand(interaction, client, logger) {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client, logger);
  } catch (error) {
    console.error(error);
    console.log(interaction.options);
    logger.error(`Error ejecutando el comando ${interaction.commandName}:`, error);
    await interaction.reply({ content: "Hubo un error al ejecutar este comando.", flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client, logger) {
    if (!interaction) return;
    if (interaction.type === InteractionType.ApplicationCommand) {
      await executeCommand(interaction, client, logger);
    }
  },
};
