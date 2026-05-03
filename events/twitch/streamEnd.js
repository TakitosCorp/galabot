const { twitchLog } = require("../../utils/loggers");
const {
  getActiveStream,
  getStreamById,
  updateStreamEnd,
} = require("../../db/streams");
const axios = require("axios");
const { getStreamerScheduleThisWeek } = require("../../utils/twitchSchedule");
const { generateNextStreamsImage } = require("../../utils/imageGenerator");
const { stopViewersAverage } = require("../../utils/twitchViews");

async function streamEnd(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;

    const activeStream = await getActiveStream("twitch");
    if (!activeStream) {
      twitchLog("warn", "No active Twitch stream found to mark as ended.");
      return;
    }

    const { id: streamId, discMsgId } = activeStream;
    const endTime = event.endDate
      ? event.endDate.toISOString()
      : new Date().toISOString();

    stopViewersAverage(streamId);
    const updated = await updateStreamEnd(streamId, endTime);

    const finalStream = await getStreamById(streamId);
    if (!finalStream) {
      twitchLog(
        "error",
        `Could not read final stream data for ID ${streamId}.`,
      );
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
        } catch (schedErr) {
          if (schedErr.isAxiosError && schedErr.response?.status === 404) {
            twitchLog(
              "info",
              "No Twitch schedule found, skipping next-streams image.",
            );
            scheduleThisWeek = [];
          } else {
            throw schedErr;
          }
        }
        imageBuffer = await generateNextStreamsImage(scheduleThisWeek);
      }
    } catch (imgErr) {
      twitchLog(
        "error",
        `Error generating next-streams image: ${imgErr.stack}`,
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
                  name: "📌 Title",
                  value: finalStream.title || "No title",
                  inline: false,
                },
                {
                  name: "🎮 Category",
                  value: `*${finalStream.category || "No category"}*`,
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

            const attachment = imageBuffer
              ? new AttachmentBuilder(imageBuffer, { name: "next-streams.png" })
              : null;

            if (attachment) embed.setImage("attachment://next-streams.png");

            await message.edit({
              embeds: [embed],
              components: [],
              files: attachment ? [attachment] : [],
            });
            twitchLog("info", "Discord message updated for stream end.");
          }
        }
      }
    } catch (editErr) {
      twitchLog("error", `Could not edit Discord message: ${editErr.stack}`);
    }

    if (updated) {
      twitchLog("info", `Stream ${streamId} marked as ended.`);
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
        twitchLog("info", "Stream end webhook sent.");
      } catch (webhookErr) {
        twitchLog(
          "error",
          `Error sending stream end webhook: ${webhookErr.stack}`,
        );
      }
    } else {
      twitchLog(
        "warn",
        `Stream ${streamId} was not found in DB to mark as ended.`,
      );
    }
  } catch (error) {
    twitchLog("error", `Error handling stream end: ${error.stack}`);
  }
}

module.exports = streamEnd;
