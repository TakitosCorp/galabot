/**
 * @module commands/discord/rules
 * @description
 * `/rules` slash command. Two modes:
 *  - **No `user` option**: posts the bilingual server rules embed (Spanish + English) into the channel.
 *  - **With `user` option**: DMs the rules to the target user; if the DM fails, falls back to a public mention in the channel.
 *
 * Restricted to members with `Manage Messages` permission and to guild contexts.
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
const { discordLog } = require("../../utils/loggers");
const { getLanguage } = require("../../utils/language");
const strings = require("../../lang/rules");

/** @type {DiscordSlashCommand} */
module.exports = {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Sends the server rules to a channel or user.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to remind about the rules.")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  /**
   * @async
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   * @returns {Promise<void>}
   */
  async execute(interaction, client) {
    const lang = getLanguage(interaction.channelId);
    const t = strings[lang];
    const tEn = strings.en;
    const tEs = strings.es;
    const user = interaction.options.getUser("user");

    discordLog("debug", "rules:execute", {
      lang,
      issuer: interaction.user.id,
      target: user?.id ?? null,
      channelId: interaction.channelId,
    });

    if (user) {
      const reminderEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(t.reminderTitle(user.username))
        .setDescription(t.reminderDesc);

      try {
        await user.send({ embeds: [reminderEmbed] });
        discordLog("info", "rules:dm-sent", {
          target: user.tag,
          targetId: user.id,
          issuer: interaction.user.tag,
        });
        await interaction.reply({
          content: t.dmSuccess(user.tag),
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        discordLog("warn", "rules:dm-failed, falling back to channel", {
          target: user.tag,
          targetId: user.id,
          err: error.message,
        });
        try {
          const channel = await client.channels.fetch(interaction.channelId);
          await channel.send({
            content: t.dmFallback(user.id),
          });
          await interaction.reply({
            content: t.dmFallbackReply(user.tag),
            flags: MessageFlags.Ephemeral,
          });
        } catch (channelError) {
          discordLog("error", "rules:channel-fallback failed", {
            target: user.tag,
            err: channelError.message,
            stack: channelError.stack,
          });
        }
      }
    } else {
      const rulesEmbedEs = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(tEs.rulesTitle)
        .addFields(...tEs.rulesFields)
        .setImage("https://i.ibb.co/wh3TkmHN/imagen-2026-05-01-164811177.png")
        .setFooter({ text: tEs.rulesFooter });

      const rulesEmbedEn = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(tEn.rulesTitle)
        .addFields(...tEn.rulesFields)
        .setImage("https://i.ibb.co/wh3TkmHN/imagen-2026-05-01-164811177.png")
        .setFooter({ text: tEn.rulesFooter });

      discordLog("info", "rules:posted", {
        issuer: interaction.user.username,
        channelId: interaction.channelId,
      });
      await interaction.reply({ embeds: [rulesEmbedEs, rulesEmbedEn] });
    }
  },
};
