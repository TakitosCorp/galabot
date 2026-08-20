/**
 * @module events/youtube/streamEnd
 * @description
 * Records the end time on the row, resets poller state, edits the original
 * announcement embed in place, posts the final stream stats to the configured
 * webhook, and completes the matching Discord scheduled event. Uses the
 * cached upcoming streams to save quota.
 */

import { youtubeLog } from "../../utils/core/loggers.js";
import { getActiveStream, updateStreamEnd } from "../../db/streams.js";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { setIdleStatus } from "../../utils/discord/discordPresence.js";
import { cleanStreamTitle } from "../../utils/helpers/streamTitleCleaner.js";
import { getState, setState } from "../../utils/youtube/youtubePoller.js";
import {
  generateFollowupImage,
  generateEndedImage,
} from "../../utils/helpers/imageGenerator.js";
import { completeGuildStreamEvent } from "../../utils/discord/discordGuildEvents.js";
import axios from "axios";

/**
 * Wrap up the just-ended YouTube stream.
 *
 * @async
 * @param {import('../../handlers/clientManager.js')} clientManager - The client manager instance.
 * @param {string|null} endTime - ISO-8601 actual end time reported by the API.
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

    await completeGuildStreamEvent(discordClient, streamData.id);

    const { upcomingStreams } = getState();

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
    let streams = [];

    try {
      if (upcomingStreams && upcomingStreams.length > 0) {
        const now = Date.now();
        for (const streamInfo of upcomingStreams) {
          if (streamInfo.videoId === streamData.id) continue;

          if (new Date(streamInfo.scheduledStart).getTime() > now) {
            streams.push({
              title: streamInfo.title,
              category: streamInfo.category,
              start: streamInfo.scheduledStart,
              gameBoxArtUrl: streamInfo.thumbnail,
            });
          }
        }
        streams.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );
        youtubeLog("debug", "youtube:streamEnd using cached upcoming streams", {
          count: streams.length,
        });
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
                  value: cleanStreamTitle(streamData.title),
                  inline: false,
                },
                ...(streams.length === 0
                  ? [
                      {
                        name: "Status",
                        value: "The stream has ended",
                        inline: false,
                      },
                    ]
                  : []),
                ...(streams.length > 0
                  ? [
                      {
                        name: "Next streams",
                        value: streams
                          .map((s) => {
                            const epoch = Math.floor(
                              new Date(s.start).getTime() / 1000,
                            );
                            return `• ${s.title} – <t:${epoch}:F>`;
                          })
                          .join("\n"),
                        inline: false,
                      },
                    ]
                  : []),
              )
              .setFooter({
                text:
                  streams.length > 0
                    ? "Thanks for stopping by • Image times are in UTC"
                    : "Thanks for stopping by",
              })
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
      });
    }

    setIdleStatus(discordClient);

    if (process.env.POST_DATA_WEBHOOK) {
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: streamData.id,
          provider: "youtube",
          timestamp: streamData.timestamp
            ? new Date(streamData.timestamp).toISOString()
            : null,
          title: cleanStreamTitle(streamData.title),
          viewers: streamData.viewers || 0,
          category: streamData.category || null,
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
    youtubeLog("error", "youtube:streamEnd failed", { err: error.message });
  }
}

export default streamEnd;
