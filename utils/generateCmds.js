/**
 * @module utils/generateCmds
 * @description
 * Standalone CLI script (`npm run generate-cmds`) that wipes every existing
 * application-level Discord slash command for the bot and re-publishes the
 * commands defined in `commands/discord/*.js`. Run this whenever the slash
 * command schema changes — the live bot will pick up the new shapes on the
 * next interaction.
 *
 * This file is a script, not a module — it logs to the console (rather than
 * Winston) because it runs outside the bot's normal lifecycle.
 */

"use strict";

const fs = require("fs");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: require("path").resolve(process.cwd(), ".env") });

/**
 * Authenticated REST client used to delete and republish global commands.
 * @type {REST}
 */
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

/**
 * Delete every previously-published global slash command, then upload every
 * command module under `commands/discord/`. A failure of any individual
 * command is fatal — the script aborts and prints the error.
 *
 * @async
 * @returns {Promise<void>}
 */
async function resetGlobalCommands() {
  try {
    const commands = await rest.get(
      Routes.applicationCommands(process.env.DISCORD_ID),
    );
    const deletePromises = commands.map((command) => {
      const deleteUrl = `${Routes.applicationCommands(process.env.DISCORD_ID)}/${command.id}`;
      console.log(
        `[❎] Eliminando comando: ${command.name} (ID: ${command.id})`,
      );
      return rest.delete(deleteUrl);
    });
    await Promise.all(deletePromises);
    console.log(`[✅] Todos los comandos han sido eliminados correctamente.`);

    const globalCommands = [];
    const commandsDir = path.join(__dirname, "../commands/discord");
    const commandFiles = fs
      .readdirSync(commandsDir)
      .filter((archivo) => archivo.endsWith(".js"));
    for (const archivo of commandFiles) {
      const commandPath = path.join(commandsDir, archivo);
      const command = require(commandPath);
      globalCommands.push(command.data.toJSON());
    }

    await rest.put(Routes.applicationCommands(process.env.DISCORD_ID), {
      body: globalCommands,
    });
    console.log("[✅] Se han publicado los comandos globales.");
  } catch (e) {
    console.error(`[❌] Error en el proceso: ${e.message}`);
  }
}

resetGlobalCommands();
