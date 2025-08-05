const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: require("path").resolve(process.cwd(), ".env") });

// Create Discord client with Guilds intent
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log("Bot listo");

  try {
    // Fetch and delete all existing application emojis
    const existingEmojis = await client.application.emojis.fetch();
    for (const emoji of existingEmojis.values()) {
      try {
        await emoji.delete();
        console.log(`Eliminado emoji: ${emoji.name}`);
      } catch (error) {
        console.error(`Error al eliminar el emoji ${emoji.name}:`, error);
      }
    }

    // Fetch guild and its emojis
    const guild = await client.guilds.fetch("1080660073497505822");
    const emojis = await guild.emojis.fetch();

    const tempFolder = path.join(__dirname, "temp-emojis");
    const dataFolder = path.join(__dirname, "../data");
    const emojisFile = path.join(dataFolder, "emojis.json");

    if (!fs.existsSync(tempFolder)) {
      await fsp.mkdir(tempFolder);
    }
    if (!fs.existsSync(dataFolder)) {
      await fsp.mkdir(dataFolder);
    }

    // Helper function: Download image from URL to file
    const downloadImage = async (url, filePath) => {
      const response = await axios({
        url,
        method: "GET",
        responseType: "stream",
      });
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    };

    // Helper function: Sanitize emoji name
    const sanitizeName = (name) => {
      return name.toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    // Track created emoji names to avoid duplicates
    const createdEmojiNames = new Set();
    const emojiData = {};

    // Iterate over each guild emoji
    for (const emoji of emojis.values()) {
      try {
        const imageURL = emoji.url;
        let baseName = `galabot_${sanitizeName(emoji.name)}`;
        let uniqueName = baseName;
        let index = 1;

        // Ensure emoji name is unique
        while (createdEmojiNames.has(uniqueName)) {
          uniqueName = `${baseName}_${index}`;
          index++;
        }

        createdEmojiNames.add(uniqueName);

        // Download emoji image to temp folder
        const tempFileName = `temp-${uniqueName}.png`;
        const tempFilePath = path.join(tempFolder, tempFileName);
        await downloadImage(imageURL, tempFilePath);

        // Create emoji in application
        const createdEmoji = await client.application.emojis.create({
          attachment: tempFilePath,
          name: uniqueName,
        });

        // Save emoji reference for output
        emojiData[uniqueName] = `<:${createdEmoji.name}:${createdEmoji.id}>`;
        console.log(`Creado emoji: ${createdEmoji.name}`);

        // Delete temp image file
        await fsp.unlink(tempFilePath);
      } catch (error) {
        console.error(`Error al procesar el emoji ${emoji.name}:`, error);
      }
    }

    // Remove temp folder after processing
    await fsp.rm(tempFolder, { recursive: true });
    console.log("Carpeta temporal eliminada.");

    // Write emoji data to JSON file
    await fsp.writeFile(emojisFile, JSON.stringify(emojiData, null, 2));
    console.log(`Emojis guardados en: ${emojisFile}`);
  } catch (error) {
    console.error("Error durante el proceso:", error);
  }

  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
