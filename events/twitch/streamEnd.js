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

async function streamEnd(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;

    const activeStream = await getActiveStream("twitch");
    if (!activeStream) {
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
      return;
    }

    let imageBuffer = null;
    let isFollowup = false;

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
            scheduleThisWeek = [];
          } else {
            throw schedErr;
          }
        }

        if (scheduleThisWeek && scheduleThisWeek.length > 0) {
          imageBuffer = await generateFollowupImage(
            { provider: "twitch" },
            scheduleThisWeek,
          );
          isFollowup = true;
        } else {
          imageBuffer = await generateEndedImage({ provider: "twitch" });
        }
      }
    } catch (imgErr) {
      twitchLog("error", `Error generating end image: ${imgErr.message}`);
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
            } catch (userErr) {}

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
                {
                  name: "Category",
                  value: `*${finalStream.category || "No category"}*`,
                  inline: false,
                },
                {
                  name: "Status",
                  value: "The stream has ended",
                  inline: false,
                },
              )
              .setFooter({ text: "Thanks for stopping by" })
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
          }
        }
      }
    } catch (editErr) {
      twitchLog("error", `Could not edit Discord message: ${editErr.message}`);
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
      } catch (webhookErr) {}
    }
  } catch (error) {
    twitchLog("error", `Error handling stream end: ${error.stack}`);
  }
}

module.exports = streamEnd;
