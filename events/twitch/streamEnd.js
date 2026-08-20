/**
 * @module events/twitch/streamEnd
 * @description
 * Reacts to a Twitch `streamOffline` EventSub by recording the end time,
 * editing the embed, posting final stats to the webhook, and completing the
 * matching Discord scheduled event.
 */

import { twitchLog } from "../../utils/core/loggers.js";
import {
  getActiveStream,
  getStreamById,
  updateStreamEnd,
} from "../../db/streams.js";
import axios from "axios";
import { getStreamerScheduleThisWeek } from "../../utils/twitch/twitchSchedule.js";
import {
  generateFollowupImage,
  generateEndedImage,
} from "../../utils/helpers/imageGenerator.js";
import { cleanStreamTitle } from "../../utils/helpers/streamTitleCleaner.js";
import { stopViewersAverage } from "../../utils/twitch/twitchViews.js";
import { setIdleStatus } from "../../utils/discord/discordPresence.js";
import { completeGuildStreamEvent } from "../../utils/discord/discordGuildEvents.js";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";

/**
 * Process a `streamOffline` EventSub event.
 *
 * @async
 * @param {import('@twurple/eventsub-base').EventSubStreamOfflineEvent} event - The Twurple stream offline event.
 * @param {import('../../handlers/clientManager.js')} clientManager - The client manager instance.
 * @returns {Promise<void>}
 */
async function streamEnd(event, clientManager) {
  twitchLog("debug", "twitch:streamEnd enter", {
    broadcaster: event.broadcasterDisplayName,
  });
  try {
    const { discordClient, twitchApiClient } = clientManager;

    const activeStream = await getActiveStream("twitch");
    if (!activeStream) {
      twitchLog("warn", "twitch:streamEnd no-active-stream");
      return;
    }

    const { id: streamId, discMsgId } = activeStream;
    const endTime = event.endDate
      ? event.endDate.toISOString()
      : new Date().toISOString();

    stopViewersAverage(streamId);
    twitchLog("debug", "twitch:streamEnd viewers-stopped", { streamId });
    const updated = await updateStreamEnd(streamId, endTime);
    twitchLog("info", "twitch:streamEnd row marked ended", {
      streamId,
      endTime,
      updated,
    });

    await completeGuildStreamEvent(discordClient, streamId);

    const finalStream = await getStreamById(streamId);
    if (!finalStream) {
      twitchLog("warn", "twitch:streamEnd row missing post-update", {
        streamId,
      });
      return;
    }

    let imageBuffer = null;
    let isFollowup = false;
    let scheduleThisWeek = [];

    try {
      const twitchUsername = process.env.TWITCH_CHANNEL;
      if (twitchUsername) {
        try {
          scheduleThisWeek = await getStreamerScheduleThisWeek(
            twitchUsername,
            twitchApiClient,
          );
        } catch (schedErr) {
          if (schedErr.isAxiosError && schedErr.response?.status === 404) {
            twitchLog("info", "twitch:streamEnd no-schedule (404)");
            scheduleThisWeek = [];
          } else {
            throw schedErr;
          }
        }

        if (scheduleThisWeek && scheduleThisWeek.length > 0) {
          twitchLog("debug", "twitch:streamEnd generating followup", {
            segments: scheduleThisWeek.length,
          });
          imageBuffer = await generateFollowupImage(
            { provider: "twitch" },
            scheduleThisWeek,
          );
          isFollowup = true;
        } else {
          twitchLog("debug", "twitch:streamEnd generating ended-image");
          imageBuffer = await generateEndedImage({ provider: "twitch" });
        }
      }
    } catch (imgErr) {
      twitchLog("error", "twitch:streamEnd image-generation failed", {
        err: imgErr.message,
      });
    }

    try {
      const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
      if (channelId && discMsgId && discordClient && discordClient.isReady()) {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(discMsgId);
          if (message) {
            let user = null;
            let twitchUrl = null;
            try {
              if (twitchApiClient && process.env.TWITCH_CHANNEL) {
                user = await twitchApiClient.users.getUserByName(
                  process.env.TWITCH_CHANNEL,
                );
                twitchUrl =
                  process.env.TWITCH_URL ||
                  `https://www.twitch.tv/${process.env.TWITCH_CHANNEL}`;
              }
            } catch (userErr) {
              twitchLog("warn", "twitch:streamEnd getUserByName failed", {
                err: userErr.message,
              });
            }

            const embed = new EmbedBuilder()
              .setColor(0x800080)
              .setAuthor({
                name: "Stream ended! Thanks for watching",
                iconURL: user?.profilePictureUrl || undefined,
                url: twitchUrl || undefined,
              })
              .addFields(
                {
                  name: "Title",
                  value: cleanStreamTitle(finalStream.title),
                  inline: false,
                },
                ...(scheduleThisWeek.length === 0
                  ? [
                      {
                        name: "Status",
                        value: "The stream has ended",
                        inline: false,
                      },
                    ]
                  : []),
                ...(scheduleThisWeek.length > 0
                  ? [
                      {
                        name: "Next streams",
                        value: scheduleThisWeek
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
                  scheduleThisWeek.length > 0
                    ? "Thanks for stopping by • Image times are in UTC"
                    : "Thanks for stopping by",
              })
              .setTimestamp(new Date(endTime));

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
            twitchLog("info", "twitch:streamEnd announcement edited", {
              streamId,
              isFollowup,
              discMsgId,
            });
          }
        }
      }
    } catch (editErr) {
      twitchLog("error", "twitch:streamEnd edit-message failed", {
        err: editErr.message,
      });
    }

    setIdleStatus(discordClient);

    if (updated && process.env.POST_DATA_WEBHOOK) {
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: finalStream.id,
          provider: finalStream.provider,
          timestamp: finalStream.timestamp
            ? new Date(finalStream.timestamp).toISOString()
            : null,
          title: cleanStreamTitle(finalStream.title),
          viewers: finalStream.viewers || 0,
          category: finalStream.category,
          tags: finalStream.tags ? JSON.parse(finalStream.tags) : null,
          thumbnail: finalStream.thumbnail || null,
          end: endTime,
        });
        twitchLog("info", "twitch:streamEnd webhook posted", {
          streamId: finalStream.id,
        });
      } catch (webhookErr) {
        twitchLog("warn", "twitch:streamEnd webhook failed", {
          err: webhookErr.message,
        });
      }
    }
  } catch (error) {
    twitchLog("error", "twitch:streamEnd failed", { err: error.message });
  }
}

export default streamEnd;
