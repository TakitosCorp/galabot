const fs = require("fs");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
require("dotenv").config();

const rest = new REST({ version: "10" }).setToken(process.env.GALAYAKI_TOKEN);
createSlash();

async function createSlash() {
  try {
    const globalCommands = [];

    fs.readdirSync("../commands").forEach(async (category) => {
      const commandFiles = fs.readdirSync(`../commands/${category}`).filter((archivo) => archivo.endsWith(".js"));
      for (const archivo of commandFiles) {
        const command = require(`../commands/${category}/${archivo}`);
        globalCommands.push(command.data.toJSON());
      }
    });

    await rest.put(Routes.applicationCommands(process.env.GALAYAKI_ID), {
      body: globalCommands,
    });

    console.log("[✅] Se han publicado los comandos globales.");
  } catch (e) {
    console.error(e);
  }
}
