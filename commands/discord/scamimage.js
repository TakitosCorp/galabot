/**
 * @module commands/discord/scamimage
 * @description
 * `/scamimage` slash command — administrator tool for managing the perceptual-hash
 * database used by the automated scam-image ban system.
 *
 * Subcommands:
 *  - `add`    — register up to four images (computes blockhash, saves thumbnail, stores in DB).
 *  - `list`   — paginated embed (one hash per page) with image preview and navigation buttons.
 *  - `remove` — delete a hash by its database ID.
 *  - `check`  — test whether an image would trigger the ban without posting it publicly.
 *
 * @typedef {import('../../utils/core/types').DiscordSlashCommand} DiscordSlashCommand
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import axios from "axios";
import sharp from "sharp";
import {
  addScamHash,
  updateScamHashFilename,
  listScamHashes,
  getAllScamHashes,
  removeScamHash,
} from "../../db/scamHashes.js";
import {
  computeHash,
  hammingDistance,
  isSimilar,
} from "../../utils/discord/imageHash.js";
import { discordLog } from "../../utils/core/loggers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, "../../data");
const scamImagesDir = path.join(dataDir, "scam-images");

/**
 * Build a single paginated list page for a given index.
 * Returns the embed, an optional image attachment, and an optional navigation row.
 *
 * @param {Array} hashes - Full ordered list from listScamHashes().
 * @param {number} page - Zero-based page index.
 * @returns {{ embed: EmbedBuilder, attachment: AttachmentBuilder|null, row: ActionRowBuilder|null }}
 */
export function buildListPage(hashes, page) {
  const total = hashes.length;
  const entry = hashes[page];
  const date = new Date(entry.added_at).toLocaleDateString("en-US");

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle("Scam image hashes")
    .addFields(
      { name: "Hash", value: `\`${entry.hash}\``, inline: false },
      {
        name: "Description",
        value: entry.description || "*No description*",
        inline: true,
      },
      { name: "Added by", value: `<@${entry.added_by}>`, inline: true },
      { name: "Date", value: date, inline: true },
    )
    .setFooter({ text: `Page ${page + 1} / ${total} · ID ${entry.id}` });

  let attachment = null;
  if (entry.filename) {
    const thumbPath = path.join(scamImagesDir, entry.filename);
    if (fs.existsSync(thumbPath)) {
      attachment = new AttachmentBuilder(thumbPath, { name: entry.filename });
      embed.setImage(`attachment://${entry.filename}`);
    }
  }

  let row = null;
  if (total > 1) {
    row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`scam-list:page:${page - 1}`)
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`scam-list:page:${page + 1}`)
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === total - 1),
    );
  }

  return { embed, attachment, row };
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAdd(interaction) {
  const description = interaction.options.getString("description");
  const attachments = ["image1", "image2", "image3", "image4"]
    .map((key) => interaction.options.getAttachment(key))
    .filter(Boolean)
    .filter((a) => a.contentType?.startsWith("image/"));

  if (attachments.length === 0) {
    return interaction.reply({
      content: "No valid images provided.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let added = 0;
  const errors = [];

  for (const att of attachments) {
    try {
      const response = await axios.get(att.url, {
        responseType: "arraybuffer",
      });
      const buffer = Buffer.from(response.data);
      const hash = await computeHash(buffer);
      const insertedId = await addScamHash(
        hash,
        description,
        interaction.user.id,
      );

      const filename = `${insertedId}.webp`;
      await sharp(buffer)
        .resize({
          width: 300,
          height: 300,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 60 })
        .toFile(path.join(scamImagesDir, filename));
      await updateScamHashFilename(insertedId, filename);

      added++;
      discordLog("info", "scamimage:add registered", {
        hash: hash.slice(0, 8),
        by: interaction.user.id,
        filename: att.name,
        id: insertedId,
      });
    } catch (err) {
      discordLog("error", "scamimage:add failed", {
        filename: att.name,
        err: err.message,
        stack: err.stack,
      });
      errors.push(att.name);
    }
  }

  const lines = [`✅ **${added}** scam hash(es) registered.`];
  if (errors.length > 0) {
    lines.push(`⚠️ Failed to process: ${errors.join(", ")}`);
  }
  return interaction.editReply({ content: lines.join("\n") });
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleList(interaction) {
  const hashes = await listScamHashes();

  if (hashes.length === 0) {
    return interaction.reply({
      content: "No scam hashes registered.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const { embed, attachment, row } = buildListPage(hashes, 0);

  return interaction.reply({
    embeds: [embed],
    files: attachment ? [attachment] : [],
    components: row ? [row] : [],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleRemove(interaction) {
  const id = interaction.options.getInteger("id");
  const deleted = await removeScamHash(id);

  if (deleted === 0) {
    return interaction.reply({
      content: `No hash found with ID **${id}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  discordLog("info", "scamimage:remove", { id, by: interaction.user.id });
  return interaction.reply({
    content: `✅ Hash ID **${id}** removed.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleCheck(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const att = interaction.options.getAttachment("image1");

  if (!att.contentType?.startsWith("image/")) {
    return interaction.editReply({
      content: "Please provide a valid image attachment.",
    });
  }

  let buffer;
  try {
    const response = await axios.get(att.url, { responseType: "arraybuffer" });
    buffer = Buffer.from(response.data);
  } catch (err) {
    return interaction.editReply({
      content: `Failed to download image: ${err.message}`,
    });
  }

  let hash;
  try {
    hash = await computeHash(buffer);
  } catch (err) {
    return interaction.editReply({
      content: `Failed to hash image: ${err.message}`,
    });
  }

  const knownHashes = await getAllScamHashes();

  if (knownHashes.length === 0) {
    return interaction.editReply({
      content: "ℹ️ No scam hashes registered yet.",
    });
  }

  let minDist = Infinity;
  let closest = null;
  for (const row of knownHashes) {
    const dist = hammingDistance(row.hash, hash);
    if (dist < minDist) {
      minDist = dist;
      closest = row;
    }
  }

  discordLog("info", "scamimage:check", {
    by: interaction.user.id,
    minDist,
    closestId: closest.id,
    matched: isSimilar(closest.hash, hash),
  });

  if (isSimilar(closest.hash, hash)) {
    return interaction.editReply({
      content: `✅ **Match found!**\nID **${closest.id}**${closest.description ? ` — ${closest.description}` : ""}\nHamming distance: **${minDist}/256 bits**`,
    });
  }

  return interaction.editReply({
    content: `❌ **No match.** Closest: ID **${closest.id}** at **${minDist}/256 bits** (threshold is 10).`,
  });
}

/** @type {DiscordSlashCommand} */
export const data = new SlashCommandBuilder()
  .setName("scamimage")
  .setDescription("Manage the scam image hash database.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Register one or more scam images.")
      .addAttachmentOption((opt) =>
        opt
          .setName("image1")
          .setDescription("First scam image.")
          .setRequired(true),
      )
      .addAttachmentOption((opt) =>
        opt.setName("image2").setDescription("Second scam image (optional)."),
      )
      .addAttachmentOption((opt) =>
        opt.setName("image3").setDescription("Third scam image (optional)."),
      )
      .addAttachmentOption((opt) =>
        opt.setName("image4").setDescription("Fourth scam image (optional)."),
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Optional note or description."),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all registered scam hashes."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a scam hash by its ID.")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("ID of the hash to remove.")
          .setRequired(true)
          .setMinValue(1),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("check")
      .setDescription("Test if an image would trigger the scam ban.")
      .addAttachmentOption((opt) =>
        opt
          .setName("image1")
          .setDescription("Image to test.")
          .setRequired(true),
      ),
  );

/**
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  discordLog("debug", "scamimage:execute", { sub, by: interaction.user.id });

  if (sub === "add") return handleAdd(interaction);
  if (sub === "list") return handleList(interaction);
  if (sub === "remove") return handleRemove(interaction);
  if (sub === "check") return handleCheck(interaction);
}
