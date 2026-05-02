const { youtubeLog } = require("../../utils/loggers");
const {
  insertYoutubeStream,
  youtubeStreamExists,
} = require("../../db/youtubeStreams");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { generateYoutubeBanner } = require("../../utils/imageGenerator");
const { setState } = require("../../utils/youtubePoller");

async function streamStart(clientManager, streamState) {
  try {
    const { discordClient } = clientManager;
    const { videoId, title, thumbnail, scheduledStart, streamUrl } =
      streamState;

    if (!discordClient || !discordClient.isReady()) {
      youtubeLog(
        "error",
        "Discord client is not ready. Skipping stream start notification.",
      );
      return;
    }

    if (await youtubeStreamExists(videoId)) {
      youtubeLog(
        "warn",
        `Stream ${videoId} already exists in DB — notification already sent. Skipping.`,
      );
      setState({ embedSent: true, status: "live" });
      return;
    }

    const resources = require("../../data/resources.json");
    const streamTitles = resources.en.streamTitles;
    const randomTitle =
      streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment = null;
    try {
      const bannerBuffer = await generateYoutubeBanner({ title, thumbnail });
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
      youtubeLog("info", "YouTube banner generated successfully.");
    } catch (bannerErr) {
      youtubeLog(
        "warn",
        `Could not generate YouTube banner, falling back to thumbnail: ${bannerErr.message}`,
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: randomTitle, url: streamUrl })
      .addFields(
        { name: "📝 Title", value: title || "No title", inline: false },
        { name: "🔗 Link", value: streamUrl, inline: false },
      )
      .setImage(attachment ? "attachment://stream-banner.png" : thumbnail)
      .setTimestamp(scheduledStart ? new Date(scheduledStart) : new Date())
      .setFooter({ text: "Come say hi! ^^" });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Watch stream :3")
        .setStyle(ButtonStyle.Link)
        .setURL(streamUrl),
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      youtubeLog("error", "DISCORD_NOTIFICATION_CHANNEL env var is not set.");
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      youtubeLog(
        "error",
        `Notification channel (${channelId}) not found or is not a text channel.`,
      );
      return;
    }

    const roleToMention = process.env.DISCORD_NOTIFICATION_ROLE_ID;
    const messageOptions = {
      content: roleToMention ? `<@&${roleToMention}>` : "",
      embeds: [embed],
      components: [button],
      ...(attachment ? { files: [attachment] } : {}),
    };

    const sentMessage = await channel.send(messageOptions);
    youtubeLog("info", "Discord notification sent for YouTube stream start.");

    await insertYoutubeStream({
      id: videoId,
      timestamp: scheduledStart
        ? new Date(scheduledStart).toISOString()
        : new Date().toISOString(),
      title: title || "No title",
      viewers: 0,
      thumbnail: thumbnail || "",
      discMsgId: sentMessage.id,
    });
    youtubeLog("info", `YouTube stream saved to DB with ID: ${videoId}`);

    setState({ embedSent: true, status: "live" });
  } catch (error) {
    youtubeLog("error", `Error handling YouTube stream start: ${error.stack}`);
  }
}

module.exports = streamStart;
