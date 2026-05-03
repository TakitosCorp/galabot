/**
 * @module events/youtube/streamEnd
 * @description
 * Triggered by {@link module:handlers/youtube/startup.runFastPoll} when the
 * tracked video reports `actualEndTime`. Records the end time on the row,
 * resets poller state, edits the original announcement embed in place to a
 * "next streams" follow-up or generic ended image, and posts the final stream
 * stats to the configured webhook.
 */

"use strict";

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

/**
 * Wrap up the just-ended YouTube stream.
 *
 * @async
 * @param {import('../../clientManager')} clientManager
 * @param {string|null} endTime - ISO-8601 actual end time reported by the API; falls back to "now" when unavailable.
 * @returns {Promise<void>}
 */
async function streamEnd(clientManager, endTime) {
  youtubeLog("debug", "youtube:streamEnd enter", { endTime });
  try {
    const { discordClient } = clientManager;

    const streamData = await getActiveStream("youtube");
    if (!streamData) {
      youtubeLog("warn", "youtube:streamEnd no-active-stream");
      return;
    }

    const resolvedEndTime = endTime || new Date().toISOString();
    await updateStreamEnd(streamData.id, resolvedEndTime);
    youtubeLog("info", "youtube:streamEnd row marked ended", {
      videoId: streamData.id,
      endTime: resolvedEndTime,
    });

    setState({
      status: "ended",
      embedSent: false,
      videoId: null,
      title: null,
      thumbnail: null,
      scheduledStart: null,
      streamUrl: null,
    });
    youtubeLog("debug", "youtube:streamEnd state reset");

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
        youtubeLog("debug", "youtube:streamEnd generating followup", {
          segments: streams.length,
        });
        imageBuffer = await generateFollowupImage(
          { provider: "youtube" },
          streams,
        );
        isFollowup = true;
      } else {
        youtubeLog("debug", "youtube:streamEnd generating ended-image");
        imageBuffer = await generateEndedImage({ provider: "youtube" });
      }
    } catch (imgErr) {
      youtubeLog("error", "youtube:streamEnd image-generation failed", {
        err: imgErr.message,
        stack: imgErr.stack,
      });
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
            youtubeLog("info", "youtube:streamEnd announcement edited", {
              videoId: streamData.id,
              isFollowup,
              discMsgId: streamData.discMsgId,
            });
          }
        }
      }
    } catch (editErr) {
      youtubeLog("error", "youtube:streamEnd edit-message failed", {
        err: editErr.message,
        stack: editErr.stack,
      });
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
        youtubeLog("info", "youtube:streamEnd webhook posted", {
          videoId: streamData.id,
        });
      } catch (webhookErr) {
        youtubeLog("warn", "youtube:streamEnd webhook failed", {
          err: webhookErr.message,
        });
      }
    }
  } catch (error) {
    youtubeLog("error", "youtube:streamEnd failed", {
      err: error.message,
      stack: error.stack,
    });
  }
}

module.exports = streamEnd;
