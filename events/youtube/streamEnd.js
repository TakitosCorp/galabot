const { youtubeLog } = require("../../utils/loggers");
const {
  getMostRecentYoutubeStream,
  updateYoutubeStreamEnd,
} = require("../../db/youtubeStreams");
const { EmbedBuilder } = require("discord.js");
const { setState } = require("../../utils/youtubePoller");
const axios = require("axios");

async function streamEnd(clientManager, endTime) {
  try {
    const { discordClient } = clientManager;

    const streamData = await getMostRecentYoutubeStream();
    if (!streamData) {
      youtubeLog(
        "warn",
        "No active YouTube stream found in DB to mark as ended.",
      );
      return;
    }

    const resolvedEndTime = endTime || new Date().toISOString();
    await updateYoutubeStreamEnd(streamData.id, resolvedEndTime);
    youtubeLog(
      "info",
      `YouTube stream ${streamData.id} marked as ended in DB.`,
    );

    setState({
      status: "ended",
      embedSent: false,
      videoId: null,
      title: null,
      thumbnail: null,
      scheduledStart: null,
      streamUrl: null,
    });

    try {
      const channelId = process.env.YOUTUBE_NOTIFICATION_CHANNEL;
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
              .setAuthor({ name: "Stream ended! Thanks for watching 💜" })
              .addFields(
                {
                  name: "📝 Title",
                  value: streamData.title || "No title",
                  inline: false,
                },
                {
                  name: "📺 Status",
                  value: "The stream has ended — see you next time!",
                  inline: false,
                },
                {
                  name: "👁️ Average viewers",
                  value: String(Math.round(streamData.viewers || 0)),
                  inline: false,
                },
              )
              .setFooter({ text: "Thanks for stopping by the stream 💜" })
              .setTimestamp(new Date(resolvedEndTime));

            await message.edit({ embeds: [embed], components: [] });
            youtubeLog(
              "info",
              "Discord message edited to reflect YouTube stream end.",
            );
          }
        }
      }
    } catch (editErr) {
      youtubeLog(
        "error",
        `Could not edit Discord message for stream end: ${editErr.stack}`,
      );
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
        youtubeLog("info", "YouTube stream end webhook sent successfully.");
      } catch (webhookErr) {
        youtubeLog(
          "error",
          `Error sending YouTube stream end webhook: ${webhookErr.stack}`,
        );
      }
    }
  } catch (error) {
    youtubeLog("error", `Error handling YouTube stream end: ${error.stack}`);
  }
}

module.exports = streamEnd;
