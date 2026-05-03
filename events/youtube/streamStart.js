const { youtubeLog } = require("../../utils/loggers");
const { insertStream, streamExists } = require("../../db/streams");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { generateStreamBanner } = require("../../utils/imageGenerator");
const { setState } = require("../../utils/youtubePoller");

async function streamStart(clientManager, streamState) {
  try {
    const { discordClient } = clientManager;
    const { videoId, title, thumbnail, scheduledStart, streamUrl } =
      streamState;

    if (!discordClient || !discordClient.isReady()) {
      return;
    }

    if (await streamExists(videoId)) {
      setState({ embedSent: true, status: "live" });
      return;
    }

    const resources = require("../../data/resources.json");
    const streamTitles = resources.en.streamTitles;
    const randomTitle =
      streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment = null;
    try {
      const bannerData = {
        provider: "youtube",
        title: title || "No title",
        category: "YouTube Live",
        image: thumbnail || "",
      };

      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
    } catch (bannerErr) {
      attachment = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: randomTitle, url: streamUrl })
      .addFields(
        { name: "Title", value: title || "No title", inline: false },
        { name: "Link", value: streamUrl, inline: false },
      )
      .setImage(attachment ? "attachment://stream-banner.png" : thumbnail)
      .setTimestamp(scheduledStart ? new Date(scheduledStart) : new Date())
      .setFooter({ text: "Come say hi! ^^" });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Watch stream")
        .setStyle(ButtonStyle.Link)
        .setURL(streamUrl),
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
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

    await insertStream({
      id: videoId,
      provider: "youtube",
      timestamp: scheduledStart
        ? new Date(scheduledStart).toISOString()
        : new Date().toISOString(),
      title: title || "No title",
      viewers: 0,
      thumbnail: thumbnail || null,
      discMsgId: sentMessage.id,
    });

    setState({ embedSent: true, status: "live" });
  } catch (error) {
    youtubeLog("error", `Error handling YouTube stream start: ${error.stack}`);
  }
}

module.exports = streamStart;
