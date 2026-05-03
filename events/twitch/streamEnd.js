/**
 * @module events/twitch/streamEnd
 * @description
 * Reacts to a Twitch `streamOffline` EventSub by:
 *  1. Stopping the viewer-average poller for the active stream.
 *  2. Recording the end timestamp on the matching stream row.
 *  3. Editing the original Discord announcement embed in place to either
 *     (a) a "next streams" follow-up if a weekly schedule is published, or
 *     (b) a generic "stream ended" image otherwise.
 *  4. Posting the final stream stats to the configured webhook.
 */

"use strict";

const { twitchLog } = require("../../utils/loggers");
const {
  getActiveStream,
  getStreamById,
  updateStreamEnd,
} = require("../../db/streams");
const axios = require("axios");
const { getStreamerScheduleThisWeek } = require("../../utils/twitchSchedule");
const {
  generateFollowupImage,
  generateEndedImage,
} = require("../../utils/imageGenerator");
const { stopViewersAverage } = require("../../utils/twitchViews");

/**
 * Process a `streamOffline` EventSub event. Errors are logged at every step but
 * never thrown — the EventSub listener stays subscribed regardless.
 *
 * @async
 * @param {import('@twurple/eventsub-base').EventSubStreamOfflineEvent} event
 * @param {import('../../clientManager')} clientManager
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
        stack: imgErr.stack,
      });
    }

    try {
      const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
      if (channelId && discMsgId && discordClient && discordClient.isReady()) {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(discMsgId);
          if (message) {
            const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

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
                  value: finalStream.title || "No title",
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
        stack: editErr.stack,
      });
    }

    if (updated) {
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: finalStream.id,
          provider: finalStream.provider,
          timestamp: finalStream.timestamp
            ? new Date(finalStream.timestamp).toISOString()
            : null,
          title: finalStream.title,
          viewers: finalStream.viewers || 0,
          category: finalStream.category,
          tags: finalStream.tags ? JSON.parse(finalStream.tags) : null,
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
    twitchLog("error", "twitch:streamEnd failed", {
      err: error.message,
      stack: error.stack,
    });
  }
}

module.exports = streamEnd;
