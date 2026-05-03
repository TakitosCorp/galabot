const { twitchLog } = require("../../utils/loggers");
const {
  insertStream,
  streamExists,
  updateStreamDiscordMessage,
} = require("../../db/streams");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { generateStreamBanner } = require("../../utils/imageGenerator");
const { startViewersAverage } = require("../../utils/twitchViews");

async function streamStart(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;

    if (!discordClient || !discordClient.isReady()) {
      return;
    }

    const stream = await event.getStream();
    if (!stream) {
      return;
    }

    const resources = require("../../data/resources.json");
    const streamTitles = resources.en.streamTitles;
    const user = await event.getBroadcaster();

    let gameInfo = null;
    if (stream.gameId && twitchApiClient) {
      try {
        gameInfo = await twitchApiClient.games.getGameById(stream.gameId);
      } catch (error) {}
    }

    const twitchUrl =
      process.env.TWITCH_URL ||
      `https://www.twitch.tv/${event.broadcasterName}`;
    const randomTitle =
      streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment;
    try {
      const bannerData = {
        provider: "twitch",
        title: stream.title || "No title",
        category: stream.gameName || "No category",
        image: gameInfo
          ? gameInfo.getBoxArtUrl(432, 576)
          : stream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`,
      };

      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
    } catch (error) {
      attachment = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0x800080)
      .setAuthor({
        name: randomTitle,
        iconURL: user.profilePictureUrl,
        url: twitchUrl,
      })
      .setURL(twitchUrl)
      .addFields(
        { name: "Title", value: stream.title || "No title", inline: false },
        {
          name: "Category",
          value: `*${stream.gameName || "No category"}*`,
          inline: false,
        },
        {
          name: "Tags",
          value:
            stream.tags && stream.tags.length > 0
              ? stream.tags.map((tag) => `\`${tag}\``).join(" ")
              : "None",
          inline: false,
        },
      )
      .setImage(
        attachment
          ? "attachment://stream-banner.png"
          : stream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`,
      )
      .setTimestamp(event.startDate)
      .setFooter({
        text: "Come say hi! ^^",
      });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Watch stream")
        .setStyle(ButtonStyle.Link)
        .setURL(twitchUrl),
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const roleToMention = process.env.DISCORD_NOTIFICATION_ROLE_ID;
      const messageOptions = {
        content: roleToMention ? `<@&${roleToMention}>` : "",
        embeds: [embed],
        components: [button],
        ...(attachment ? { files: [attachment] } : {}),
      };

      const sentMessage = await channel.send(messageOptions);
      const discMsgId = sentMessage.id;

      if (!(await streamExists(event.id))) {
        const streamData = {
          id: event.id,
          provider: "twitch",
          timestamp: event.startDate.toISOString(),
          title: stream.title || "No title",
          viewers: 0,
          category: stream.gameName || "No category",
          tags: JSON.stringify(stream.tags || []),
          discMsgId,
        };
        await insertStream(streamData);
      } else {
        await updateStreamDiscordMessage(event.id, discMsgId);
      }

      if (twitchApiClient && process.env.TWITCH_CHANNEL) {
        startViewersAverage(
          event.id,
          twitchApiClient,
          process.env.TWITCH_CHANNEL,
        );
      }
    }
  } catch (error) {
    twitchLog("error", `Error handling stream start: ${error.stack}`);
  }
}
module.exports = streamStart;
