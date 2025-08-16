const { twitchLog } = require("../../utils/loggers");
const { insertStream, streamExists, updateStreamDiscordMessage } = require("../../db/streams");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { streamTitles } = require("../../data/resources.json");
const { generateStreamBanner } = require("../../utils/imageGenerator");

async function streamStart(event, clientManager) {
  try {
    const { discordClient, twitchApiClient } = clientManager;

    if (!discordClient || !discordClient.isReady()) {
      twitchLog("error", "El cliente de Discord no está listo. Omitiendo notificación de inicio de stream.");
      return;
    }

    const stream = await event.getStream();
    if (!stream) {
      twitchLog("warn", "No se pudo obtener información adicional del stream para marcar como iniciado.");
      return;
    }

    const user = await event.getBroadcaster();

    let gameInfo = null;
    if (stream.gameId && twitchApiClient) {
      try {
        gameInfo = await twitchApiClient.games.getGameById(stream.gameId);
        twitchLog("info", `Información del juego obtenida: ${gameInfo?.name || "Desconocido"}`);
      } catch (error) {
        twitchLog("warn", `No se pudo obtener información del juego: ${error.message}`);
      }
    }

    twitchLog("info", `Stream más reciente iniciado por ${event.broadcasterDisplayName}. Título: ${stream.title}`);

    const twitchUrl = `https://www.twitch.tv/${event.broadcasterName}`;
    const randomTitle = streamTitles[Math.floor(Math.random() * streamTitles.length)];

    let attachment;
    try {
      const bannerData = {
        title: stream.title || "Sin título",
        category: stream.gameName || "Sin categoría",
        gameId: stream.gameId,
        gameBoxArtUrl: gameInfo ? gameInfo.getBoxArtUrl(432, 576) : null,
      };

      const bannerBuffer = await generateStreamBanner(bannerData);
      attachment = new AttachmentBuilder(bannerBuffer, { name: "stream-banner.png" });
      twitchLog("info", "Banner personalizado generado exitosamente.");
    } catch (error) {
      twitchLog("error", `Error al generar el banner personalizado: ${error.message}`);
      attachment = null;
    }

    const embed = new EmbedBuilder()
      .setColor(0x800080)
      .setAuthor({
        name: randomTitle,
        iconURL: user.profilePictureUrl,
        url: twitchUrl,
      })
      .setURL(twitchUrl)
      .addFields(
        { name: "📝 Título", value: stream.title || "Sin título", inline: false },
        { name: "🎮 Categoría", value: `*${stream.gameName || "Sin categoría"}*`, inline: false },
        {
          name: "🏷️ Etiquetas",
          value: stream.tags && stream.tags.length > 0 ? stream.tags.map((tag) => `\`${tag}\``).join(" ") : "Ninguna",
          inline: false,
        }
      )
      .setImage(attachment ? "attachment://stream-banner.png" : stream.getThumbnailUrl(1280, 720) + `?t=${Date.now()}`)
      .setTimestamp(event.startDate)
      .setFooter({
        text: `${stream.isMature ? "🔞 Contenido para adultos | " : ""}¡Pásate a saludar! ^^`,
      });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Ver directo :3").setStyle(ButtonStyle.Link).setURL(twitchUrl)
    );

    const channelId = process.env.DISCORD_NOTIFICATION_CHANNEL;
    if (!channelId) {
      twitchLog("error", "La variable de entorno DISCORD_NOTIFICATION_CHANNEL no está definida.");
      return;
    }

    const channel = await discordClient.channels.fetch(channelId);
    if (channel && channel.isTextBased()) {
      const roleToMention = process.env.DISCORD_NOTIFICATION_ROLE_ID;
      const messageOptions = {
        content: roleToMention ? `<@&${roleToMention}>` : "",
        embeds: [embed],
        components: [button],
        ...(attachment ? { files: [attachment] } : {}),
      };
      
      const sentMessage = await channel.send(messageOptions);
      twitchLog("info", "Mensaje de Discord enviado para notificar el inicio del stream.");

      const discMsgId = sentMessage.id;

      if (!(await streamExists(event.id))) {
        const streamData = {
          id: event.id,
          timestamp: event.startDate.toISOString(),
          title: stream.title || "Sin título",
          viewers: 0,
          category: stream.gameName || "Sin categoría",
          tags: JSON.stringify(stream.tags || []),
          discMsgId,
        };
        await insertStream(streamData);
        twitchLog("info", `Stream guardado en la base de datos con ID: ${event.id}.`);
      } else {
        await updateStreamDiscordMessage(event.id, discMsgId);
      }
    } else {
      twitchLog("error", `No se encontró el canal de notificaciones (${channelId}) o no es un canal de texto.`);
    }
  } catch (error) {
    twitchLog("error", `Error al marcar el inicio del stream: ${error.stack}`);
  }
}
module.exports = streamStart;
