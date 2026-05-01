const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  InteractionContextType,
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
    const user = interaction.options.getUser("user");

    if (user) {
      const reminderEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(t.reminderTitle(user.username))
        .setDescription(t.reminderDesc);

      try {
        await user.send({ embeds: [reminderEmbed] });
        discordLog("info", t.logDmSent(user.tag, interaction.user.tag));
        await interaction.reply({
          content: t.dmSuccess(user.tag),
          ephemeral: true,
        });
      } catch (error) {
        discordLog("warn", t.logDmFail(user.tag));
        try {
          const channel = await client.channels.fetch(interaction.channelId);
          await channel.send({ content: t.dmFallback(user.id) });
          await interaction.reply({
            content: t.dmFallbackReply(user.tag),
            ephemeral: true,
          });
        } catch (channelError) {
          discordLog("error", t.logChannelFail(channelError.message));
        }
      }
    } else {
      const rulesEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(t.rulesTitle)
        .addFields(...t.rulesFields)
        .setImage(
          "https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true",
        )
        .setThumbnail(
          "https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_knife.png?raw=true",
        )
        .setFooter({ text: t.rulesFooter });

      const extraEmbed = new EmbedBuilder()
        .setColor(0xff4500)
        .setTitle(t.extraTitle)
        .addFields(...t.extraFields)
        .setImage(
          "https://github.com/AlexDeveloperUwU/alexdev-files/blob/main/images/gala_eyes_png.png?raw=true",
        );

      discordLog("info", t.logSent(interaction.user.username));
      await interaction.reply({ embeds: [rulesEmbed, extraEmbed] });
    }
  },
};
