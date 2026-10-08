/**
 * @module commands/discord/rules
 * @description
 * `/rules` slash command. Two modes:
 *  - **No `user` option**: posts the bilingual server rules embed (Spanish + English) into the channel.
 *  - **With `user` option**: DMs the rules to the target user; if the DM fails, falls back to a public mention in the channel.
 *
 * Restricted to members with `Manage Messages` permission and to guild contexts.
 *
 * @typedef {import('../../utils/core/types.js').DiscordSlashCommand} DiscordSlashCommand
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { discordLog } from "../../utils/core/loggers.js";
import { getLanguage } from "../../utils/core/language.js";
import strings from "../../lang/discord/rules.js";
import {
  parseReactionRoleEnv,
  addReactionsToMessage,
  trackMessage,
} from "../../utils/discord/reactionRoleManager.js";

/** @type {DiscordSlashCommand} */
export const data = new SlashCommandBuilder()
  .setName("rules")
  .setDescription("Sends the server rules to a channel or user.")
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user to remind about the rules.")
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild);

/**
 * Resolve the channel configured in the optional `NSFW_CHANNEL_ID` env var.
 *
 * @async
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').GuildBasedChannel|null>} `null` when unset or not fetchable.
 */
async function fetchNsfwChannel(guild) {
  const channelId = process.env.NSFW_CHANNEL_ID;
  if (!channelId) return null;
  try {
    return await guild.channels.fetch(channelId);
  } catch (err) {
    discordLog("warn", "rules:nsfw-channel fetch failed", {
      channelId,
      err: err.message,
    });
    return null;
  }
}

/**
 * Rules fields with the NSFW channel rule inserted before the trailing
 * spacer + warnings fields. The rule is omitted when no channel resolved.
 *
 * @param {typeof strings.en} t
 * @param {import('discord.js').GuildBasedChannel|null} nsfwChannel
 * @returns {import('discord.js').APIEmbedField[]}
 */
function buildRulesFields(t, nsfwChannel) {
  const fields = [...t.rulesFields];
  if (nsfwChannel) {
    fields.splice(-2, 0, t.nsfwChannelField(nsfwChannel.toString()));
  }
  return fields;
}

/**
 * @async
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('discord.js').Client} client
 * @returns {Promise<void>}
 */
export async function execute(interaction, client) {
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
    const rulesChannel = process.env.RULES_CHANNEL_ID
      ? `<#${process.env.RULES_CHANNEL_ID}>`
      : t.rulesChannelFallback;
    const reminderEmbed = new EmbedBuilder()
      .setColor(0x800080)
      .setTitle(t.reminderTitle(user.username))
      .setDescription(t.reminderDesc(rulesChannel));

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
          content: t.dmFallback(user.id, rulesChannel),
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
    const nsfwChannel = await fetchNsfwChannel(interaction.guild);

    const rulesEmbedEs = new EmbedBuilder()
      .setColor(0x800080)
      .setTitle(tEs.rulesTitle)
      .addFields(...buildRulesFields(tEs, nsfwChannel))
      .setImage("https://i.ibb.co/wh3TkmHN/imagen-2026-05-01-164811177.png")
      .setFooter({ text: tEs.rulesFooter });

    const rulesEmbedEn = new EmbedBuilder()
      .setColor(0x800080)
      .setTitle(tEn.rulesTitle)
      .addFields(...buildRulesFields(tEn, nsfwChannel))
      .setImage("https://i.ibb.co/wh3TkmHN/imagen-2026-05-01-164811177.png")
      .setFooter({ text: tEn.rulesFooter });

    discordLog("info", "rules:posted", {
      issuer: interaction.user.username,
      channelId: interaction.channelId,
    });
    const {
      resource: { message: sentMessage },
    } = await interaction.reply({
      embeds: [rulesEmbedEs, rulesEmbedEn],
      withResponse: true,
    });

    const emojiRoleMap = parseReactionRoleEnv("RULES");
    if (emojiRoleMap.size > 0) {
      await addReactionsToMessage(sentMessage, emojiRoleMap);
      await trackMessage(
        sentMessage.id,
        sentMessage.channelId,
        interaction.guildId,
        "RULES",
      );
      discordLog("info", "rules:reaction-roles added", {
        messageId: sentMessage.id,
        count: emojiRoleMap.size,
      });
    }
  }
}
