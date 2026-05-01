const { twitchLog } = require("../../utils/loggers");
const { updateStreamEnd, getMostRecentStream } = require("../../db/streams");
const axios = require("axios");
const { getStreamerScheduleThisWeek } = require("../../utils/twitchSchedule");
const { generateNextStreamsImage } = require("../../utils/imageGenerator");
const { stopViewersAverage } = require("../../utils/twitchViews");

async function streamEnd(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;

    const initialStreamInfo = await getMostRecentStream();
    if (!initialStreamInfo) {
      twitchLog("warn", "No active stream found to mark as ended.");
      return;
    }
    const streamId = initialStreamInfo.id;
    const discMsgId = initialStreamInfo.discMsgId;

    const endTime = event.endDate
      ? event.endDate.toISOString()
      : new Date().toISOString();

    stopViewersAverage(streamId);

    const updated = await updateStreamEnd(streamId, endTime);

    const finalStreamData = await getMostRecentStream();
    if (!finalStreamData) {
      twitchLog("error", `Could not get final stream data for ID ${streamId}.`);
      return;
    }

    let imageBuffer = null;
    try {
      const twitchUsername = process.env.TWITCH_CHANNEL;
      if (twitchUsername) {
        let scheduleThisWeek;
        try {
          scheduleThisWeek = await getStreamerScheduleThisWeek(
            twitchUsername,
            twitchApiClient,
          );
        } catch (imgErr) {
          if (imgErr.isAxiosError && imgErr.response?.status === 404) {
            twitchLog(
              "info",
              "User has no schedule, using empty array for next streams image.",
            );
            scheduleThisWeek = [];
          } else {
            throw imgErr;
          }
        }
        imageBuffer = await generateNextStreamsImage(scheduleThisWeek);
      }
    } catch (imgErr) {
      if (imgErr.isAxiosError) {
        const status = imgErr.response?.status;
        twitchLog(
          "error",
          `Axios error fetching schedule: ${imgErr.message}${status ? ` (status: ${status})` : ""}`,
        );
      }
      twitchLog(
        "error",
        `Error generating next streams image: ${imgErr.stack}`,
      );
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
                twitchUrl = `https://www.twitch.tv/${process.env.TWITCH_CHANNEL}`;
              }
            } catch (userErr) {
              twitchLog(
                "warn",
                `Could not get Twitch user for author: ${userErr.message}`,
              );
            }
            const embed = new EmbedBuilder()
              .setColor(0x800080)
              .setAuthor({
                name: "Stream ended! Thanks for watching 💜",
                iconURL: user?.profilePictureUrl || undefined,
                url: twitchUrl || undefined,
              })
              .addFields(
                {
                  name: "📝 Title",
                  value: finalStreamData.title || "No title",
                  inline: false,
                },
                {
                  name: "🎮 Category",
                  value: `*${finalStreamData.category || "No category"}*`,
                  inline: false,
                },
                {
                  name: "📺 Status",
                  value: "The stream has ended — see you next time!",
                  inline: false,
                },
              )
              .setFooter({ text: "Thanks for stopping by the stream 💜" })
              .setTimestamp(new Date(endTime));
            let attachment = null;
            if (imageBuffer) {
              attachment = new AttachmentBuilder(imageBuffer, {
                name: "next-streams.png",
              });
            }
            if (attachment) {
              embed.setImage("attachment://next-streams.png");
            } else if (finalStreamData.getThumbnailUrl) {
              embed.setImage(
                finalStreamData.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`,
              );
            }
            const editOptions = {
              embeds: [embed],
              components: [],
              ...(attachment ? { files: [attachment] } : {}),
            };
            await message.edit(editOptions);
            twitchLog("info", "Discord message edited to reflect stream end.");
          }
        }
      }
    } catch (editErr) {
      twitchLog("error", `Could not edit Discord message: ${editErr.stack}`);
    }

    if (updated) {
      twitchLog("info", `Stream ${streamId} marked as ended in the database.`);
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: finalStreamData.id,
          timestamp: finalStreamData.timestamp
            ? new Date(finalStreamData.timestamp).toISOString()
            : null,
          title: finalStreamData.title,
          viewers: finalStreamData.viewers || 0,
          category: finalStreamData.category,
          tags: finalStreamData.tags ? JSON.parse(finalStreamData.tags) : [],
          end: endTime,
        });
        twitchLog("info", "Stream end webhook sent successfully.");
      } catch (webhookErr) {
        twitchLog(
          "error",
          `Error sending stream end webhook: ${webhookErr.stack}`,
        );
      }
    } else {
      twitchLog("warn", `Stream ${streamId} not found to mark as ended.`);
    }
  } catch (error) {
    twitchLog("error", `Error handling stream end: ${error.stack}`);
  }
}

module.exports = streamEnd;
