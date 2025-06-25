const dotenv = require("dotenv");
const axios = require("axios");
const { getFilePath, writeJSON, ensureFileExists } = require("../utils/fileUtils");
const { workflowLogger, streamLogger, notificationLogger } = require("../loggers/index");

dotenv.config();
const apiKey = process.env.GALAYAKI_YTAPIKEY;
const channelId = process.env.GALAYAKI_YTCHANNELID;

const youtubeUtils = {
  async getUpcomingStreams() {
    workflowLogger.info("Obteniendo streams programados del canal");
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=upcoming&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    streamLogger.debug(`Respuesta recibida: ${response.data.items ? response.data.items.length : 0} resultados`);
    return response.data;
  },

  async getOngoingStream() {
    workflowLogger.info("Obteniendo streams en directo del canal");
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    streamLogger.debug(
      `Respuesta recibida: ${response.data.items ? response.data.items.length : 0} resultados en directo`
    );
    return response.data;
  },

  async getOngoingStats(videoId) {
    workflowLogger.info(`Obteniendo estadísticas para el video: ${videoId}`);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${apiKey}`;
    const response = await axios.get(url);
    streamLogger.debug(`Datos de estadísticas recibidos para ${videoId}`);
    return response.data;
  },
};

function isStreamValid(streamDate, now) {
  return now - streamDate <= 12 * 60 * 60 * 1000;
}

function extractStreamData(videoId, stats) {
  if (!stats || !stats.items || stats.items.length === 0) return null;

  const streamData = stats.items[0];
  if (!streamData.snippet || !streamData.liveStreamingDetails) return null;

  const startTime =
    streamData.liveStreamingDetails.actualStartTime || streamData.liveStreamingDetails.scheduledStartTime;
  if (!startTime) return null;

  const thumbnail = streamData.snippet.thumbnails.maxres
    ? streamData.snippet.thumbnails.maxres.url
    : streamData.snippet.thumbnails.high
    ? streamData.snippet.thumbnails.high.url
    : streamData.snippet.thumbnails.default.url;

  workflowLogger.info(`Datos extraídos para stream "${streamData.snippet.title}" (ID: ${videoId})`);
  return {
    videoId,
    scheduledStart: startTime,
    title: streamData.snippet.title,
    thumbnail,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedSent: false,
  };
}

function saveEmbedStatus(status) {
  try {
    const embedStatusFile = getFilePath("embedStatus.json");
    ensureFileExists(embedStatusFile);
    writeJSON(embedStatusFile, { sent: status });
    notificationLogger.info(`Estado del embed actualizado: ${status ? "enviado" : "no enviado"}`);
  } catch (error) {
    notificationLogger.error("Error al guardar el estado del embed:", error);
  }
}

async function checkStreamLive(stream) {
  try {
    const now = new Date();
    const streamDate = new Date(stream.scheduledStart);

    workflowLogger.info(`Comprobando stream: "${stream.title}" (ID: ${stream.videoId})`);
    workflowLogger.debug(
      `Fecha programada: ${streamDate.toISOString()}, Diferencia: ${Math.round(
        (now - streamDate) / (60 * 1000)
      )} minutos`
    );

    workflowLogger.info(`Obteniendo estadísticas en vivo para: ${stream.videoId}`);
    const ongoingStats = await youtubeUtils.getOngoingStats(stream.videoId);

    if (!ongoingStats || !ongoingStats.items || ongoingStats.items.length === 0) {
      workflowLogger.warn(`No hay estadísticas disponibles para el stream ${stream.videoId}`);
      return false;
    }

    const liveDetails = ongoingStats.items[0].liveStreamingDetails;
    workflowLogger.debug(`Detalles recibidos: ${JSON.stringify(liveDetails)}`);

    if (liveDetails && liveDetails.concurrentViewers) {
      workflowLogger.info(`¡Stream en directo! Espectadores actuales: ${liveDetails.concurrentViewers}`);
      return true;
    } else {
      if (liveDetails) {
        if (liveDetails.actualStartTime) {
          workflowLogger.info(
            `Stream iniciado pero sin datos de espectadores. Hora de inicio: ${liveDetails.actualStartTime}`
          );
        } else if (liveDetails.scheduledStartTime) {
          const scheduledDate = new Date(liveDetails.scheduledStartTime);
          const minutesToStart = Math.round((scheduledDate - now) / (60 * 1000));
          workflowLogger.info(
            `Stream programado para iniciar en ${minutesToStart} minutos (${scheduledDate.toISOString()})`
          );
        }
      } else {
        workflowLogger.warn(`No hay detalles de transmisión disponibles para ${stream.videoId}`);
      }
      return false;
    }
  } catch (error) {
    workflowLogger.error(`Error al comprobar si el stream está en directo: ${error.message}`, error);
    return false;
  }
}

const workflows = {
  async updateWorkflow() {
    try {
      workflowLogger.info("===== WORKFLOW DE ACTUALIZACIÓN INICIADO =====");
      const nowDate = new Date();

      const upcomingStreamsFile = getFilePath("upcomingStreams.json");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      workflowLogger.info(`Preparando archivos de datos`);

      const upcomingStreamsArray = [];
      ensureFileExists(upcomingStreamsFile);
      ensureFileExists(nextUpcomingStreamFile);

      workflowLogger.info("Buscando streams en directo actualmente");
      let ongoingStream = null;
      try {
        const ongoingStreamData = await youtubeUtils.getOngoingStream();

        if (ongoingStreamData.items && ongoingStreamData.items.length > 0) {
          const videoId = ongoingStreamData.items[0].id.videoId;
          workflowLogger.info(`Stream en directo detectado con ID: ${videoId}`);

          const stats = await youtubeUtils.getOngoingStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (streamData) {
            ongoingStream = streamData;
            upcomingStreamsArray.push(ongoingStream);
            workflowLogger.info(`Stream en directo añadido: "${ongoingStream.title}"`);
          } else {
            workflowLogger.warn(`No se pudieron extraer datos del stream en directo con ID: ${videoId}`);
          }
        } else {
          workflowLogger.info("No hay streams en directo actualmente");
        }
      } catch (error) {
        workflowLogger.error("Error al obtener streams en directo:", error);
      }

      workflowLogger.info("Buscando próximos streams programados");
      try {
        const upcomingStreams = await youtubeUtils.getUpcomingStreams();

        if (upcomingStreams.items && upcomingStreams.items.length > 0) {
          workflowLogger.info(`Procesando ${upcomingStreams.items.length} streams futuros`);

          for (const item of upcomingStreams.items) {
            try {
              const videoId = item.id.videoId;
              workflowLogger.info(`Procesando stream con ID: ${videoId}`);

              const stats = await youtubeUtils.getOngoingStats(videoId);
              const streamData = extractStreamData(videoId, stats);

              if (streamData) {
                const scheduledStart = new Date(streamData.scheduledStart);
                workflowLogger.info(`Stream "${streamData.title}" programado para: ${scheduledStart.toISOString()}`);

                if (
                  (scheduledStart > nowDate || isStreamValid(scheduledStart, nowDate)) &&
                  !streamData.title.includes("【HORARIO SEMANAL】 Free chat! || GalaYaki")
                ) {
                  upcomingStreamsArray.push(streamData);
                  workflowLogger.info(`Stream futuro añadido: "${streamData.title}"`);
                } else {
                  if (!isStreamValid(scheduledStart, nowDate)) {
                    workflowLogger.info(`Stream "${streamData.title}" demasiado antiguo, ignorado`);
                  }
                  if (streamData.title.includes("【HORARIO SEMANAL】")) {
                    workflowLogger.info(`Stream "${streamData.title}" es horario semanal, ignorado`);
                  }
                }
              } else {
                workflowLogger.warn(`No se pudieron extraer datos del stream con ID: ${videoId}`);
              }
            } catch (itemError) {
              workflowLogger.warn(`Error al procesar stream individual: ${itemError.message}`);
              continue;
            }
          }
        } else {
          workflowLogger.info("No se encontraron streams programados");
        }
      } catch (error) {
        workflowLogger.error("Error al obtener próximos streams:", error);
      }

      workflowLogger.info(`Guardando ${upcomingStreamsArray.length} streams en el archivo`);
      writeJSON(upcomingStreamsFile, upcomingStreamsArray);

      workflowLogger.info("Ordenando streams por fecha");
      upcomingStreamsArray.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

      let nextStream = null;
      if (ongoingStream) {
        nextStream = ongoingStream;
        workflowLogger.info(`Stream en directo seleccionado como próximo: "${nextStream.title}"`);
      } else if (upcomingStreamsArray.length > 0) {
        nextStream = upcomingStreamsArray[0];
        workflowLogger.info(`Stream futuro seleccionado como próximo: "${nextStream.title}"`);
      } else {
        workflowLogger.warn("No se encontraron streams para definir como próximo");
      }

      if (nextStream) {
        const streamStart = new Date(nextStream.scheduledStart);
        workflowLogger.info(`Validando próximo stream: "${nextStream.title}" (${streamStart.toISOString()})`);

        if (isStreamValid(streamStart, nowDate)) {
          try {
            const existingData = require(nextUpcomingStreamFile);
            if (existingData && existingData.videoId === nextStream.videoId) {
              nextStream.embedSent = existingData.embedSent || false;
              workflowLogger.info(`Preservando estado de embed: ${nextStream.embedSent ? "ya enviado" : "no enviado"}`);
            } else {
              workflowLogger.info(`Nuevo stream detectado, estado de embed reiniciado`);
            }
          } catch (e) {
            workflowLogger.warn(`Error al leer el archivo de próximo stream: ${e.message}`);
          }

          writeJSON(nextUpcomingStreamFile, nextStream);
          workflowLogger.info(`Próximo stream guardado: "${nextStream.title}"`);
        } else {
          workflowLogger.warn(`Stream demasiado antiguo para ser guardado: "${nextStream.title}"`);
          writeJSON(nextUpcomingStreamFile, {});
        }
      } else {
        workflowLogger.warn("No se encontró ningún próximo stream para guardar");
        writeJSON(nextUpcomingStreamFile, {});
      }

      workflowLogger.info("===== WORKFLOW DE ACTUALIZACIÓN COMPLETADO =====");
      return upcomingStreamsArray;
    } catch (error) {
      workflowLogger.error("Error en actualización", error);
      return [];
    }
  },

  async checkFunction() {
    try {
      workflowLogger.info("Verificando streams en directo");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      const upcomingStreamsFile = getFilePath("upcomingStreams.json");

      ensureFileExists(nextUpcomingStreamFile);
      ensureFileExists(upcomingStreamsFile);

      let nextUpcomingStream;
      try {
        nextUpcomingStream = loadNextUpcomingStream(); // Usar la nueva función
        workflowLogger.debug(`Datos del próximo stream cargados`);
      } catch (error) {
        workflowLogger.warn(`Error al cargar el archivo nextUpcomingStream.json: ${error.message}`);
        return false;
      }

      const now = new Date();

      if (!nextUpcomingStream || !nextUpcomingStream.videoId) {
        workflowLogger.info("No hay datos de stream para comprobar");
        return false;
      }

      const streamDate = new Date(nextUpcomingStream.scheduledStart);
      workflowLogger.info(`Verificando stream: "${nextUpcomingStream.title}"`);

      if (!isStreamValid(streamDate, now)) {
        workflowLogger.info(`Stream demasiado antiguo. Buscando reemplazo.`);

        let upcomingStreams = [];
        try {
          upcomingStreams = require(upcomingStreamsFile);
          workflowLogger.info(`${upcomingStreams.length} streams disponibles para reemplazo`);
        } catch (error) {
          workflowLogger.warn(`Error al cargar upcomingStreams.json: ${error.message}`);
          upcomingStreams = [];
        }

        if (Array.isArray(upcomingStreams) && upcomingStreams.length > 0) {
          workflowLogger.info(`Filtrando streams válidos de ${upcomingStreams.length} disponibles`);
          const validStreams = upcomingStreams
            .filter((stream) => {
              const streamTime = new Date(stream.scheduledStart);
              const isValid = isStreamValid(streamTime, now);
              workflowLogger.debug(`Stream "${stream.title}" - Válido: ${isValid}`);
              return isValid;
            })
            .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

          workflowLogger.info(`${validStreams.length} streams válidos encontrados`);

          if (validStreams.length > 0) {
            const newNextStream = validStreams[0];
            workflowLogger.info(`Nuevo stream seleccionado: "${newNextStream.title}"`);

            if (newNextStream.videoId === nextUpcomingStream.videoId) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              newNextStream.scheduledStart = tomorrow.toISOString();
              workflowLogger.warn(`Mismo stream encontrado, ajustando fecha para evitar bucle`);
            }

            newNextStream.embedSent = false;
            writeJSON(nextUpcomingStreamFile, newNextStream);
            workflowLogger.info(`Nuevo stream guardado como próximo: "${newNextStream.title}"`);

            workflowLogger.info(`Verificando inmediatamente si el nuevo stream está en directo`);
            return await checkStreamLive(newNextStream);
          } else {
            workflowLogger.warn("No se encontraron streams válidos para reemplazo");
            writeJSON(nextUpcomingStreamFile, {});
            return false;
          }
        } else {
          workflowLogger.warn("No hay lista de streams futuros disponible para reemplazo");
          return false;
        }
      }

      workflowLogger.info(`Verificando si el stream "${nextUpcomingStream.title}" está en directo`);
      const result = await checkStreamLive(nextUpcomingStream);
      workflowLogger.info(`Resultado: ${result ? "STREAM EN DIRECTO" : "No está en directo"}`);
      return result;
    } catch (error) {
      workflowLogger.error("Error en verificación", error);
      return false;
    }
  },

  async sendEmbed(client, nextLiveData) {
    try {
      notificationLogger.info(`Enviando notificación para: ${nextLiveData.title}`);

      const embed = {
        color: 0x800080,
        title: `🔴 ¡Gala está iniciando un nuevo directoooowo!`,
        description: `**${nextLiveData.title}**\n\n[Haz clic aquí pa venir a ver el directito y saludar a Galita!](https://www.youtube.com/watch?v=${nextLiveData.videoId})`,
        image: { url: nextLiveData.thumbnail },
        footer: {
          text: "¡No te pierdas el directo eh, y si vienes asegúrate de dejar tu like y saludar ^.^!",
        },
      };

      const button = {
        type: 1,
        components: [
          {
            type: 2,
            label: "Ver directo",
            style: 5,
            url: `https://www.youtube.com/watch?v=${nextLiveData.videoId}`,
          },
        ],
      };

      notificationLogger.info(`Obteniendo canal de Discord: ${process.env.GALAYAKI_YTDISCORD}`);
      let channel;
      try {
        channel = await client.channels.fetch(process.env.GALAYAKI_YTDISCORD);
        if (!channel) {
          throw new Error("Canal no encontrado");
        }
        notificationLogger.info(`Canal encontrado: ${channel.name} (${channel.id})`);
      } catch (err) {
        notificationLogger.error(`Error al obtener el canal de Discord: ${err.message}`, err);
        return;
      }

      notificationLogger.info("Intentando enviar mensaje con botón");
      try {
        await channel.send({
          content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
          embeds: [embed],
          components: [button],
        });
        notificationLogger.info("✅ Notificación con botón enviada correctamente");
        saveEmbedStatus(true);

        notificationLogger.info("Actualizando estado del stream para evitar duplicados");
        const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
        try {
          const nextStream = loadNextUpcomingStream(); // Usar la nueva función
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            notificationLogger.info("Estado del stream actualizado correctamente");
          } else {
            notificationLogger.warn("El stream actual ya no coincide con el notificado");
          }
        } catch (updateError) {
          notificationLogger.error(`Error al actualizar estado del stream: ${updateError.message}`);
        }
      } catch (err) {
        notificationLogger.warn(`Error al enviar notificación con botón: ${err.message}`);
        notificationLogger.info("Intentando enviar mensaje sin botón (fallback)");

        try {
          await channel.send({
            content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
            embeds: [embed],
          });
          notificationLogger.info("✅ Notificación sin botón enviada correctamente");
          saveEmbedStatus(true);

          const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
          const nextStream = require(nextUpcomingStreamFile);
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            notificationLogger.info("Estado del stream actualizado correctamente");
          }
        } catch (finalError) {
          notificationLogger.error(`Error fatal al enviar notificación fallback: ${finalError.message}`, finalError);
        }
      }

      notificationLogger.info("===== ENVÍO DE NOTIFICACIÓN COMPLETADO =====");
    } catch (error) {
      notificationLogger.error("Error al enviar notificación", error);
    }
  },
};

function loadNextUpcomingStream() {
  const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
  delete require.cache[require.resolve(nextUpcomingStreamFile)];
  return require(nextUpcomingStreamFile);
}

module.exports = {
  youtubeUtils,
  workflows,
  loadNextUpcomingStream,
};
