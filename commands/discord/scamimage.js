/**
 * @module commands/discord/scam-image
 * @description
 * `/scam-image` slash command — administrator tool for managing the perceptual-hash
 * database used by the automated scam-image ban system.
 *
 * Subcommands:
 *  - `add`    — register one to three images (computes blockhash, stores in DB).
 *  - `list`   — display all registered hashes.
 *  - `remove` — delete a hash by its database ID.
 *
 * @typedef {import('../../utils/types').DiscordSlashCommand} DiscordSlashCommand
 */

"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require("discord.js");
const axios = require("axios");
const {
  addScamHash,
  listScamHashes,
  removeScamHash,
} = require("../../db/scamHashes");
const { computeHash } = require("../../utils/discord/imageHash");
const { discordLog } = require("../../utils/core/loggers");

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAdd(interaction) {
  const description = interaction.options.getString("description");
  const attachments = ["image1", "image2", "image3"]
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
      await addScamHash(hash, description, interaction.user.id);
      added++;
      discordLog("info", "scamimage:add registered", {
        hash: hash.slice(0, 8),
        by: interaction.user.id,
        filename: att.name,
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

  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle("Scam image hashes")
    .setDescription(`Total registered: **${hashes.length}**`);

  for (const row of hashes.slice(0, 25)) {
    const date = new Date(row.added_at).toLocaleDateString("en-US");
    embed.addFields({
      name: `ID ${row.id} — ${date}`,
      value: `\`${row.hash.slice(0, 16)}…\`${row.description ? `\n${row.description}` : ""}`,
      inline: true,
    });
  }

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

/** @type {DiscordSlashCommand} */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("scam-image")
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
    ),

  /**
   * @async
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    discordLog("debug", "scamimage:execute", { sub, by: interaction.user.id });

    if (sub === "add") return handleAdd(interaction);
    if (sub === "list") return handleList(interaction);
    if (sub === "remove") return handleRemove(interaction);
  },
};
