const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} = require("discord.js");
const { addWarn, getWarnCount } = require("../../db/warns");
const { discordLog } = require("../../utils/loggers");
const { getLanguage } = require("../../utils/language");
const strings = require("../../lang/warn");
const {
  WARN_TIMEOUT_BASE_MS,
  MAX_WARN_BEFORE_BAN,
  MAX_WARN_REASON_LENGTH,
} = require("../../utils/constants");

async function handleBan(interaction, user, guildMember, t, tEn) {
  const banEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(t.banTitle(user.username))
    .addFields(
      { name: "Reason:", value: t.banReason },
      { name: "Actions taken:", value: t.banAction },
    );

  if (
    interaction.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)
  ) {
    try {
      await user.send({ embeds: [banEmbed] });
    } catch (error) {
      discordLog("warn", tEn.dmFailBan(user.username));
    }

    try {
      await guildMember.ban({ reason: t.banReason });
      await interaction.reply({ embeds: [banEmbed] });
      discordLog("info", tEn.logBanned(user.username, interaction.user.username));
    } catch (error) {
      discordLog("error", tEn.logBanFailed(user.username, error.message));
      await interaction.reply({
        content: t.errBanFailed(user.username),
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    await interaction.reply({ content: t.errNoBanPerms, flags: MessageFlags.Ephemeral });
  }
}

async function handleWarn(interaction, user, guildMember, reason, t, tEn) {
  await addWarn(user.id, reason);
  const newWarnCount = await getWarnCount(user.id);
  const timeoutDuration = newWarnCount * WARN_TIMEOUT_BASE_MS;

  const warnEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle(t.warnTitle(user.username))
    .addFields(
      { name: "Reason:", value: reason },
      { name: t.warnCount, value: `${newWarnCount}` },
      {
        name: t.timeoutDuration,
        value: t.timeoutMinutes(timeoutDuration / 60000),
      },
    );

  if (
    interaction.guild.members.me.permissions.has(
      PermissionFlagsBits.ModerateMembers,
    )
  ) {
    try {
      await user.send({ embeds: [warnEmbed] });
    } catch (error) {
      discordLog("warn", tEn.dmFailWarn(user.username));
    }

    try {
      await guildMember.timeout(timeoutDuration, reason);
      await interaction.reply({ embeds: [warnEmbed] });
      discordLog(
        "info",
        tEn.logTimeout(
          user.username,
          timeoutDuration / 60000,
          interaction.user.username,
        ),
      );
    } catch (error) {
      discordLog("error", tEn.logTimeoutFailed(user.username, error.message));
      await interaction.reply({
        content: t.errTimeoutFailed(user.username),
        flags: MessageFlags.Ephemeral,
      });
    }
  } else {
    await interaction.reply({ content: t.errNoTimeoutPerms, flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Adds a warning to a user and applies a timeout.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to warn.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the warning.")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction, client, clientManager) {
    const lang = getLanguage(interaction.channelId);
    const t = strings[lang];
    const tEn = strings.en;
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason");
    const guildMember = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (reason.length > MAX_WARN_REASON_LENGTH) {
      return interaction.reply({
        content: `Reason too long (${reason.length} chars). Maximum is ${MAX_WARN_REASON_LENGTH}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!guildMember) {
      return interaction.reply({ content: t.errNotInServer, flags: MessageFlags.Ephemeral });
    }
    if (user.bot) {
      return interaction.reply({ content: t.errBot, flags: MessageFlags.Ephemeral });
    }
    if (guildMember.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: t.errAdmin, flags: MessageFlags.Ephemeral });
    }
    if (user.id === interaction.user.id) {
      return interaction.reply({ content: t.errSelf, flags: MessageFlags.Ephemeral });
    }

    const currentWarns = await getWarnCount(user.id);

    if (currentWarns >= MAX_WARN_BEFORE_BAN) {
      await handleBan(interaction, user, guildMember, t, tEn);
    } else {
      await handleWarn(interaction, user, guildMember, reason, t, tEn);
    }
  },
};
