const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const dotenv = require("dotenv");
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
  console.log("Bot listo");

  try {
    const existingEmojis = await client.application.emojis.fetch();
    for (const emoji of existingEmojis.values()) {
      try {
        await emoji.delete();
        console.log(`Eliminado emoji: ${emoji.name}`);
      } catch (error) {
        console.error(`Error al eliminar el emoji ${emoji.name}:`, error);
      }
    }

    const guild = await client.guilds.fetch("1080660073497505822");
    const emojis = await guild.emojis.fetch();

    const tempFolder = path.join(__dirname, "temp-emojis");
    const dataFolder = path.join(__dirname, "data");
    const emojisFile = path.join(dataFolder, "emojis.json");

    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder);
    }
    if (!fs.existsSync(dataFolder)) {
      fs.mkdirSync(dataFolder);
    }

    const downloadImage = (url, filePath) => {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        https
          .get(url, (response) => {
            if (response.statusCode !== 200) {
              reject(new Error(`HTTP Status: ${response.statusCode}`));
              return;
            }

            response.pipe(file);

            file.on("finish", () => {
              file.close(resolve);
            });
          })
          .on("error", (err) => {
            fs.unlink(filePath, () => reject(err));
          });
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
        console.log(`Creado emoji: ${createdEmoji.name}`);

        fs.unlinkSync(tempFilePath);
      } catch (error) {
        console.error(`Error al procesar el emoji ${emoji.name}:`, error);
      }
    }

    fs.rmSync(tempFolder, { recursive: true });
    console.log("Carpeta temporal eliminada.");

    fs.writeFileSync(emojisFile, JSON.stringify(emojiData, null, 2));
    console.log(`Emojis guardados en: ${emojisFile}`);
  } catch (error) {
    console.error("Error durante el proceso:", error);
  }

  client.destroy();
});

client.login(process.env.GALAYAKI_TOKEN);
