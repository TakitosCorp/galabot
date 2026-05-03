const { youtubeLog } = require("../../utils/loggers");
const { getActiveStream, updateStreamEnd } = require("../../db/streams");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const {
  setState,
  getUpcomingStreams,
  getVideoStats,
  extractStreamData,
} = require("../../utils/youtubePoller");
const {
  generateFollowupImage,
  generateEndedImage,
} = require("../../utils/imageGenerator");
const axios = require("axios");

async function streamEnd(clientManager, endTime) {
  try {
    const { discordClient } = clientManager;

    const streamData = await getActiveStream("youtube");
    if (!streamData) {
      return;
    }

    const resolvedEndTime = endTime || new Date().toISOString();
    await updateStreamEnd(streamData.id, resolvedEndTime);

    setState({
      status: "ended",
      embedSent: false,
      videoId: null,
      title: null,
      thumbnail: null,
      scheduledStart: null,
      streamUrl: null,
    });

    let imageBuffer = null;
    let isFollowup = false;

    try {
      const upcomingData = await getUpcomingStreams();
      const streams = [];

      if (upcomingData?.items?.length) {
        for (const item of upcomingData.items) {
          const vidId = item.id.videoId;
          const stats = await getVideoStats(vidId);
          const streamInfo = extractStreamData(vidId, stats);

          if (streamInfo) {
            streams.push({
              title: streamInfo.title,
              category: "YouTube Live",
              start: streamInfo.scheduledStart,
              gameBoxArtUrl: streamInfo.thumbnail,
            });
          }
        }
      }

      if (streams.length > 0) {
        imageBuffer = await generateFollowupImage(
          { provider: "youtube" },
          streams,
        );
        isFollowup = true;
      } else {
        imageBuffer = await generateEndedImage({ provider: "youtube" });
      }
    } catch (imgErr) {
      youtubeLog("error", `Error generating end image: ${imgErr.message}`);
    }

    try {
      const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
      if (
        channelId &&
        streamData.discMsgId &&
        discordClient &&
        discordClient.isReady()
      ) {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(streamData.discMsgId);
          if (message) {
            const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setAuthor({ name: "Stream ended! Thanks for watching" })
              .addFields(
                {
                  name: "Title",
                  value: streamData.title || "No title",
                  inline: false,
                },
                {
                  name: "Status",
                  value: "The stream has ended",
                  inline: false,
                },
                {
                  name: "Average viewers",
                  value: String(Math.round(streamData.viewers || 0)),
                  inline: false,
                },
              )
              .setFooter({ text: "Thanks for stopping by" })
              .setTimestamp(new Date(resolvedEndTime));

            const attachmentName = isFollowup
              ? "stream-followup.png"
              : "stream-ended.png";
            const attachment = imageBuffer
              ? new AttachmentBuilder(imageBuffer, { name: attachmentName })
              : null;

            if (attachment) embed.setImage(`attachment://${attachmentName}`);

            await message.edit({
              embeds: [embed],
              components: [],
              ...(attachment ? { files: [attachment] } : {}),
            });
          }
        }
      }
    } catch (editErr) {
      youtubeLog("error", `Could not edit Discord message: ${editErr.message}`);
    }

    if (process.env.POST_DATA_WEBHOOK) {
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: streamData.id,
          timestamp: streamData.timestamp
            ? new Date(streamData.timestamp).toISOString()
            : null,
          title: streamData.title,
          viewers: streamData.viewers || 0,
          thumbnail: streamData.thumbnail,
          end: resolvedEndTime,
        });
      } catch (webhookErr) {}
    }
  } catch (error) {
    youtubeLog("error", `Error handling YouTube stream end: ${error.stack}`);
  }
}

module.exports = streamEnd;
