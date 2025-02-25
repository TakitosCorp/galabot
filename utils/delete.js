const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
require("dotenv").config();

(async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.GALAYAKI_TOKEN);
  try {
    const commands = await rest.get(Routes.applicationCommands(process.env.GALAYAKI_ID));
    const deletePromises = commands.map((command) => {
      const deleteUrl = `${Routes.applicationCommands(process.env.GALAYAKI_ID)}/${command.id}`;
      console.log(`[❎] Eliminando comando: ${command.name} (ID: ${command.id})`);
      return rest.delete(deleteUrl);
    });

    await Promise.all(deletePromises);
    console.log(`[✅] Todos los comandos han sido eliminados correctamente.`);
  } catch (error) {
    console.error(`[❌] Error al eliminar los comandos: ${error.message}`);
  }
})();
