const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v9");
require("dotenv").config();

const rest = new REST({ version: "10" }).setToken(process.env.GALAYAKI_TOKEN);
rest.get(Routes.applicationCommands(process.env.GALAYAKI_ID)).then((data) => {
  const promises = [];
  for (const command of data) {
    console.log(`Nombre: ${command.name} | ID: ${command.id}`);
  }
  return Promise.all(promises);
});
