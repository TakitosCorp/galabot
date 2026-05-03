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

  async execute(interaction, client) {
    const lang = getLanguage(interaction.channelId);
    const t = strings[lang];
    const tEn = strings.en;
    const tEs = strings.es;
    const user = interaction.options.getUser("user");

    if (user) {
      const reminderEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(t.reminderTitle(user.username))
        .setDescription(t.reminderDesc);

      try {
        await user.send({ embeds: [reminderEmbed] });
        discordLog("info", tEn.logDmSent(user.tag, interaction.user.tag));
        await interaction.reply({
          content: t.dmSuccess(user.tag),
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        discordLog("warn", tEn.logDmFail(user.tag));
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
          discordLog("error", tEn.logChannelFail(channelError.message));
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

      discordLog("info", tEn.logSent(interaction.user.username));
      await interaction.reply({ embeds: [rulesEmbedEs, rulesEmbedEn] });
    }
  },
};
