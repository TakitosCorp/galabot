const fs = require("fs");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const dotenv = require("dotenv");

dotenv.config({ path: require("path").resolve(process.cwd(), ".env") });

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function resetGlobalCommands() {
  try {
    // Fetch all global commands for the application
    const commands = await rest.get(Routes.applicationCommands(process.env.DISCORD_ID));
    // Delete each command found
    const deletePromises = commands.map((command) => {
      const deleteUrl = `${Routes.applicationCommands(process.env.DISCORD_ID)}/${command.id}`;
      console.log(`[❎] Eliminando comando: ${command.name} (ID: ${command.id})`);
      return rest.delete(deleteUrl);
    });
    await Promise.all(deletePromises);
    console.log(`[✅] Todos los comandos han sido eliminados correctamente.`);

    // Prepare new global commands from files
    const globalCommands = [];
    const commandFiles = fs.readdirSync("./commands/discord").filter((archivo) => archivo.endsWith(".js"));
    for (const archivo of commandFiles) {
      // Import each command and add its data to the list
      const command = require(`./commands/discord/${archivo}`);
      globalCommands.push(command.data.toJSON());
    }

    // Publish the new set of global commands
    await rest.put(Routes.applicationCommands(process.env.DISCORD_ID), {
      body: globalCommands,
    });
    console.log("[✅] Se han publicado los comandos globales.");
  } catch (e) {
    console.error(`[❌] Error en el proceso: ${e.message}`);
  }
}

resetGlobalCommands();
