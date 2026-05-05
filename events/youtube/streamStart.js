/**
 * @module events/youtube/streamStart
 * @description
 * Triggered by the poller once a tracked video transitions to live.
 * Generates a banner, posts the announcement, persists the stream,
 * updates state, and activates the matching Discord scheduled event.
 */

"use strict";

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
const { cleanStreamTitle } = require("../../utils/streamTitleCleaner");
const { setState } = require("../../utils/youtubePoller");
const { setStreamingStatus } = require("../../utils/discordPresence");
const { activateGuildStreamEvent } = require("../../utils/discordGuildEvents");

/**
 * @async
 * @param {import('../../clientManager')} clientManager
 * @param {import('../../utils/types').YouTubeState} streamState
 * @returns {Promise<void>}
 */
async function streamStart(clientManager, streamState) {
  youtubeLog("debug", "youtube:streamStart enter", {
    videoId: streamState.videoId,
    title: streamState.title,
  });
  try {
    const { discordClient } = clientManager;
    const { videoId, title, thumbnail, scheduledStart, streamUrl, category } =
      streamState;

    if (!discordClient || !discordClient.isReady()) {
      youtubeLog("warn", "youtube:streamStart discord-not-ready");
      return;
    }

    if (await streamExists(videoId)) {
      youtubeLog("info", "youtube:streamStart already-announced", { videoId });
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
        category: category || "YouTube Live",
        image: thumbnail || "",
      };

      youtubeLog("debug", "youtube:streamStart generating banner", { videoId });
      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, {
        name: "stream-banner.png",
      });
    } catch (bannerErr) {
      youtubeLog("error", "youtube:streamStart banner-generation failed", {
        videoId,
        err: bannerErr.message,
      });
      attachment = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: randomTitle, url: streamUrl })
      .addFields(
        { name: "Title", value: cleanStreamTitle(title), inline: false },
        { name: "Link", value: streamUrl, inline: false },
        {
          name: "Start time",
          value: `<t:${Math.floor(new Date(scheduledStart || Date.now()).getTime() / 1000)}:f>`,
          inline: false,
        },
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
      youtubeLog("warn", "youtube:streamStart no-notification-channel");
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      youtubeLog("warn", "youtube:streamStart channel-not-text", { channelId });
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
    youtubeLog("info", "youtube:streamStart announcement posted", {
      videoId,
      channelId,
      discMsgId: sentMessage.id,
    });

    await insertStream({
      id: videoId,
      provider: "youtube",
      timestamp: scheduledStart
        ? new Date(scheduledStart).toISOString()
        : new Date().toISOString(),
      title: cleanStreamTitle(title),
      viewers: 0,
      thumbnail: thumbnail || null,
      discMsgId: sentMessage.id,
    });

    await activateGuildStreamEvent(discordClient, videoId);
    setStreamingStatus(discordClient, cleanStreamTitle(title), streamUrl);
    setState({ embedSent: true, status: "live" });
    youtubeLog("info", "youtube:streamStart state -> live", { videoId });
  } catch (error) {
    youtubeLog("error", "youtube:streamStart failed", { err: error.message });
  }
}

module.exports = streamStart;
