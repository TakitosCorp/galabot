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
      twitchLog(
        "error",
        "Discord client is not ready. Skipping stream start notification.",
      );
      return;
    }

    const stream = await event.getStream();
    if (!stream) {
      twitchLog(
        "warn",
        "Could not get additional stream info to mark as started.",
      );
      return;
    }

    const resources = require("../../data/resources.json");
    const streamTitles = resources.en.streamTitles;

    const user = await event.getBroadcaster();

    let gameInfo = null;
    if (stream.gameId && twitchApiClient) {
      try {
        gameInfo = await twitchApiClient.games.getGameById(stream.gameId);
        twitchLog(
          "info",
          `Game info retrieved: ${gameInfo?.name || "Unknown"}`,
        );
      } catch (error) {
        twitchLog("warn", `Could not get game info: ${error.message}`);
      }
    }

    twitchLog(
      "info",
      `Stream started by ${event.broadcasterDisplayName}. Title: ${stream.title}`,
    );

    const twitchUrl = `https://www.twitch.tv/${event.broadcasterName}`;
    const randomTitle =
      streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment;
    try {
      const bannerData = {
        title: stream.title || "No title",
        category: stream.gameName || "No category",
        gameId: stream.gameId,
        gameBoxArtUrl: gameInfo ? gameInfo.getBoxArtUrl(432, 576) : null,
      };

      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
      twitchLog("info", "Custom banner generated successfully.");
    } catch (error) {
      twitchLog("error", `Error generating custom banner: ${error.message}`);
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
        { name: "📝 Title", value: stream.title || "No title", inline: false },
        {
          name: "🎮 Category",
          value: `*${stream.gameName || "No category"}*`,
          inline: false,
        },
        {
          name: "🏷️ Tags",
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
        text: `${stream.isMature ? "🔞 Mature content | " : ""}Come say hi! ^^`,
      });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Watch stream :3")
        .setStyle(ButtonStyle.Link)
        .setURL(twitchUrl),
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      twitchLog("error", "DISCORD_NOTIFICATION_CHANNEL env var is not set.");
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
      twitchLog("info", "Discord message sent to notify stream start.");

      const discMsgId = sentMessage.id;

      if (!(await streamExists(event.id))) {
        const streamData = {
          id: event.id,
          timestamp: event.startDate.toISOString(),
          title: stream.title || "No title",
          viewers: 0,
          category: stream.gameName || "No category",
          tags: JSON.stringify(stream.tags || []),
          discMsgId,
        };
        await insertStream(streamData);
        twitchLog("info", `Stream saved to database with ID: ${event.id}.`);
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
    } else {
      twitchLog(
        "error",
        `Notification channel (${channelId}) not found or is not a text channel.`,
      );
    }
  } catch (error) {
    twitchLog("error", `Error handling stream start: ${error.stack}`);
  }
}
module.exports = streamStart;
