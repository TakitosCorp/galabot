const { twitchLog } = require("../../utils/loggers");
const { updateStreamEnd, getMostRecentStream } = require("../../db/streams");
const axios = require("axios");
const { getStreamerScheduleThisWeek } = require("../../utils/twitchSchedule");
const { generateNextStreamsImage } = require("../../utils/imageGenerator");

async function streamEnd(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;
    const recentStream = await getMostRecentStream();
    if (!recentStream) {
      twitchLog("warn", "No se encontró ningún stream activo para marcar como finalizado.");
      return;
    }
    const streamId = recentStream.id;
    const endTime = event.endDate ? event.endDate.toISOString() : new Date().toISOString();
    const updated = await updateStreamEnd(streamId, endTime);

    let imageBuffer = null;
    try {
      const twitchUsername = process.env.TWITCH_CHANNEL;
      if (twitchUsername) {
        const scheduleThisWeek = await getStreamerScheduleThisWeek(twitchUsername, twitchApiClient);
        imageBuffer = await generateNextStreamsImage(scheduleThisWeek);
      }
    } catch (imgErr) {
      if (imgErr.isAxiosError) {
        const status = imgErr.response?.status;
        twitchLog(
          "error",
          `Error Axios al obtener el schedule: ${imgErr.message}${status ? ` (status: ${status})` : ""}`
        );
      }
      twitchLog("error", `Error generando imagen de próximos streams: ${imgErr.stack}`);
    }

    try {
      const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
      if (channelId && recentStream.discMsgId && discordClient && discordClient.isReady()) {
        const channel = await discordClient.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(recentStream.discMsgId);
          if (message) {
            const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
            let user = null;
            let twitchUrl = null;
            try {
              if (twitchApiClient && process.env.TWITCH_CHANNEL) {
                user = await twitchApiClient.users.getUserByName(process.env.TWITCH_CHANNEL);
                twitchUrl = `https://www.twitch.tv/${process.env.TWITCH_CHANNEL}`;
              }
            } catch (userErr) {
              twitchLog("warn", `No se pudo obtener el usuario de Twitch para el author: ${userErr.message}`);
            }
            const embed = new EmbedBuilder()
              .setColor(0x800080)
              .setAuthor({
                name: "¡Stream finalizado! Gracias por acompañarnos 💜",
                iconURL: user?.profilePictureUrl || undefined,
                url: twitchUrl || undefined,
              })
              .addFields(
                { name: "📝 Título", value: recentStream.title || "Sin título", inline: false },
                { name: "📺 Estado", value: "El stream ha finalizado, ¡te veo en el siguiente!", inline: false }
              )
              .setFooter({ text: "Gracias por pasarte por el directo 💜" })
              .setTimestamp(new Date(endTime));
            let attachment = null;
            if (imageBuffer) {
              attachment = new AttachmentBuilder(imageBuffer, { name: "next-streams.png" });
            }
            if (attachment) {
              embed.setImage("attachment://next-streams.png");
            } else if (recentStream.getThumbnailUrl) {
              embed.setImage(recentStream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`);
            }
            const editOptions = {
              embeds: [embed],
              components: [],
              ...(attachment ? { files: [attachment] } : {}),
            };
            await message.edit(editOptions);
            twitchLog("info", "Mensaje de Discord editado para reflejar el fin del stream.");
          }
        }
      }
    } catch (editErr) {
      twitchLog("error", `No se pudo editar el mensaje de Discord: ${editErr.stack}`);
    }

    if (updated) {
      twitchLog("info", `Stream más reciente con ID ${streamId} marcado como finalizado en la base de datos.`);
      try {
        await axios.post(process.env.POST_DATA_WEBHOOK, {
          id: recentStream.id,
          timestamp: recentStream.timestamp ? new Date(recentStream.timestamp).toISOString() : null,
          title: recentStream.title,
          viewers: recentStream.viewers || 0,
          category: recentStream.category,
          tags: recentStream.tags || [],
          end: endTime,
        });
        twitchLog("info", "Webhook de fin de stream enviado correctamente.");
      } catch (webhookErr) {
        twitchLog("error", `Error al enviar el webhook de fin de stream: ${webhookErr.stack}`);
      }
    } else {
      twitchLog("warn", `No se encontró el stream con ID ${streamId} para marcar como finalizado.`);
    }
  } catch (error) {
    twitchLog("error", `Error al marcar el fin del stream: ${error.stack}`);
  }
}

module.exports = streamEnd;
