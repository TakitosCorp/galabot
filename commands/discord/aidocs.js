/**
 * @module commands/discord/aidocs
 * @description
 * `/aidocs` slash command. Posts a bilingual (Spanish + English) embed explaining
 * how the AI feature works: how to trigger it, what it can do, its limits, what
 * context it has access to, and the rules that apply.
 *
 * Restricted to members with `Manage Messages` permission and to guild contexts.
 *
 * @typedef {import('../../utils/core/types').DiscordSlashCommand} DiscordSlashCommand
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
} from "discord.js";
import { discordLog } from "../../utils/core/loggers.js";
import strings from "../../lang/discord/aidocs.js";

/** @type {DiscordSlashCommand} */
export const data = new SlashCommandBuilder()
  .setName("aidocs")
  .setDescription("Posts an explanation of how the AI bot feature works.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild);

/**
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
export async function execute(interaction) {
  const tEn = strings.en;
  const tEs = strings.es;

  const embedEs = new EmbedBuilder()
    .setColor(0x800080)
    .setTitle(tEs.embedTitle)
    .addFields(...tEs.embedFields)
    .setFooter({ text: tEs.embedFooter });

  const embedEn = new EmbedBuilder()
    .setColor(0x800080)
    .setTitle(tEn.embedTitle)
    .addFields(...tEn.embedFields)
    .setFooter({ text: tEn.embedFooter });

  await interaction.reply({ embeds: [embedEs, embedEn] });

  discordLog("info", "aidocs:posted", {
    issuer: interaction.user.username,
    channelId: interaction.channelId,
  });
}
