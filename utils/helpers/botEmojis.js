/**
 * @module utils/botEmojis
 * @description
 * Standalone CLI script (`npm run sync-emojis`) that mirrors every custom emoji
 * from the configured Discord guild into the bot application's emoji slots.
 * Workflow:
 *  1. Connects with the bot token.
 *  2. Deletes every existing application emoji.
 *  3. Downloads each guild emoji to a temp folder.
 *  4. Re-uploads them as application emojis under a sanitised `galabot_<name>` prefix.
 *  5. Writes the resulting `<name> → <discord-mention>` map to `data/emojis.json`
 *     so message templates can substitute `{emojis.galabot_foo}` placeholders.
 *
 * This file is a script, not a module — it logs to the console (rather than
 * Winston) because it runs outside the bot's normal lifecycle.
 */

"use strict";

const { Client, GatewayIntentBits, Events } = require("discord.js");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: require("path").resolve(process.cwd(), ".env") });

/**
 * Discord client used only for the duration of the sync. Destroyed once the
 * `ClientReady` handler completes.
 * @type {import('discord.js').Client}
 */
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

    /**
     * Stream-download a remote image to disk.
     * @param {string} url - Source URL.
     * @param {string} filePath - Absolute target path.
     * @returns {Promise<void>}
     */
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

    /**
     * Strip every non-alphanumeric character and lowercase the rest. Used to
     * derive valid Discord application-emoji names from arbitrary guild names.
     * @param {string} name
     * @returns {string}
     */
    const sanitizeName = (name) => {
      return name.toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    const createdEmojiNames = new Set();
    /** @type {Record<string, string>} */
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
