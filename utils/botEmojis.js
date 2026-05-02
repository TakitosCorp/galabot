const { Client, GatewayIntentBits, Events } = require("discord.js");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: require("path").resolve(process.cwd(), ".env") });

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async () => {
  console.log("Bot ready");

  try {
    const existingEmojis = await client.application.emojis.fetch();
    for (const emoji of existingEmojis.values()) {
      try {
        await emoji.delete();
        console.log(`Deleted emoji: ${emoji.name}`);
      } catch (error) {
        console.error(`Error deleting emoji ${emoji.name}:`, error);
      }
    }

    const guildId = process.env.GALA_DISCORD_ID;
    if (!guildId) {
      console.error("Error: GALA_DISCORD_ID is not defined in your .env file.");
      client.destroy();
      return;
    }

    const guild = await client.guilds.fetch(guildId);
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

    const sanitizeName = (name) => {
      return name.toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    const createdEmojiNames = new Set();
    const emojiData = {};

    for (const emoji of emojis.values()) {
      try {
        const imageURL = emoji.url;
        let baseName = `galabot_${sanitizeName(emoji.name)}`;
        let uniqueName = baseName;
        let index = 1;

        while (createdEmojiNames.has(uniqueName)) {
          uniqueName = `${baseName}_${index}`;
          index++;
        }

        createdEmojiNames.add(uniqueName);

        const tempFileName = `temp-${uniqueName}.png`;
        const tempFilePath = path.join(tempFolder, tempFileName);
        await downloadImage(imageURL, tempFilePath);

        const createdEmoji = await client.application.emojis.create({
          attachment: tempFilePath,
          name: uniqueName,
        });

        emojiData[uniqueName] = `<:${createdEmoji.name}:${createdEmoji.id}>`;
        console.log(`Created emoji: ${createdEmoji.name}`);

        await fsp.unlink(tempFilePath);
      } catch (error) {
        console.error(`Error processing emoji ${emoji.name}:`, error);
      }
    }

    await fsp.rm(tempFolder, { recursive: true });
    console.log("Temp folder removed.");

    await fsp.writeFile(emojisFile, JSON.stringify(emojiData, null, 2));
    console.log(`Emojis saved to: ${emojisFile}`);
  } catch (error) {
    console.error("Error during process:", error);
  }

  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
