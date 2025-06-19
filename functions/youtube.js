const dotenv = require("dotenv");
const axios = require("axios");
const { getFilePath, writeJSON, ensureFileExists } = require("../utils/fileUtils");

// Load environment variables
dotenv.config();
const apiKey = process.env.GALAYAKI_YTAPIKEY;
const channelId = process.env.GALAYAKI_YTCHANNELID;

// YouTube API utility functions
const youtubeUtils = {
  async getUpcomingStreams() {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=upcoming&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },

  async getOngoingStream() {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },

  async getOngoingStats(videoId) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${apiKey}`;
    const response = await axios.get(url);
    return response.data;
  },
};

// Helper function para validar la fecha de un stream (menos de 12 horas desde su inicio)
function isStreamValid(streamDate, now) {
  return now - streamDate <= 12 * 60 * 60 * 1000;
}

// Helper function para extraer datos de stream
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

  return {
    videoId,
    scheduledStart: startTime,
    title: streamData.snippet.title,
    thumbnail,
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedSent: false,
  };
}

// Helper function para guardar estado de envío del embed
function saveEmbedStatus(status, logger) {
  try {
    const embedStatusFile = getFilePath("embedStatus.json");
    ensureFileExists(embedStatusFile);
    writeJSON(embedStatusFile, { sent: status });
    logger.info(`Estado del embed actualizado: ${status ? "enviado" : "no enviado"}`);
  } catch (error) {
    logger.error("Error al guardar el estado del embed:", error);
  }
}

// Helper function para comprobar si un stream está en directo
async function checkStreamLive(stream, logger) {
  try {
    const now = new Date();
    const streamDate = new Date(stream.scheduledStart);

    logger.info(`[CHECK LIVE] Comprobando stream: "${stream.title}" (ID: ${stream.videoId})`);
    logger.info(`[CHECK LIVE] Fecha programada: ${streamDate.toISOString()}, Fecha actual: ${now.toISOString()}`);
    logger.info(`[CHECK LIVE] Diferencia de tiempo: ${Math.round((now - streamDate) / (60 * 1000))} minutos`);

    // Obtener estadísticas en tiempo real del stream
    logger.info(`[CHECK LIVE] Obteniendo estadísticas para videoId: ${stream.videoId}`);
    const ongoingStats = await youtubeUtils.getOngoingStats(stream.videoId);

    // Verificar si hay estadísticas disponibles
    if (!ongoingStats || !ongoingStats.items || ongoingStats.items.length === 0) {
      logger.warn(`[CHECK LIVE] No hay estadísticas disponibles para el stream ${stream.videoId}`);
      return false;
    }

    const liveDetails = ongoingStats.items[0].liveStreamingDetails;
    logger.debug(`[CHECK LIVE] Detalles de transmisión: ${JSON.stringify(liveDetails)}`);

    // Comprobar si el stream está en directo (tiene espectadores)
    if (liveDetails && liveDetails.concurrentViewers) {
      logger.info(`[CHECK LIVE] ¡Stream en directo! Espectadores actuales: ${liveDetails.concurrentViewers}`);
      return true;
    } else {
      if (liveDetails) {
        if (liveDetails.actualStartTime) {
          logger.info(
            `[CHECK LIVE] Stream iniciado pero sin datos de espectadores. Hora de inicio: ${liveDetails.actualStartTime}`
          );
        } else if (liveDetails.scheduledStartTime) {
          const scheduledDate = new Date(liveDetails.scheduledStartTime);
          const minutesToStart = Math.round((scheduledDate - now) / (60 * 1000));
          logger.info(
            `[CHECK LIVE] Stream programado para iniciar en ${minutesToStart} minutos (${scheduledDate.toISOString()})`
          );
        }
      } else {
        logger.warn(`[CHECK LIVE] No hay detalles de transmisión disponibles para ${stream.videoId}`);
      }
      return false;
    }
  } catch (error) {
    logger.error(`[CHECK LIVE] Error al comprobar si el stream está en directo: ${error.message}`, error);
    return false;
  }
}

// Workflow implementation
const workflows = {
  // Workflow 1: Update stream information every 4 hours
  async updateWorkflow(logger) {
    try {
      logger.info("===== INICIANDO WORKFLOW DE ACTUALIZACIÓN DE STREAMS =====");
      const nowDate = new Date();
      logger.info(`Fecha actual: ${nowDate.toISOString()}`);

      const upcomingStreamsFile = getFilePath("upcomingStreams.json");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      logger.info(`Archivos: ${upcomingStreamsFile}, ${nextUpcomingStreamFile}`);

      const upcomingStreamsArray = [];
      ensureFileExists(upcomingStreamsFile);
      ensureFileExists(nextUpcomingStreamFile);

      // Paso 1: Obtener stream en directo si existe
      logger.info("[WORKFLOW 1] Buscando streams en directo...");
      let ongoingStream = null;
      try {
        const ongoingStreamData = await youtubeUtils.getOngoingStream();
        logger.debug(`[WORKFLOW 1] Respuesta de streams en directo: ${JSON.stringify(ongoingStreamData)}`);

        if (ongoingStreamData.items && ongoingStreamData.items.length > 0) {
          const videoId = ongoingStreamData.items[0].id.videoId;
          logger.info(`[WORKFLOW 1] Stream en directo detectado con ID: ${videoId}`);

          const stats = await youtubeUtils.getOngoingStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (streamData) {
            ongoingStream = streamData;
            upcomingStreamsArray.push(ongoingStream);
            logger.info(`[WORKFLOW 1] Stream en directo añadido: "${ongoingStream.title}"`);
          } else {
            logger.warn(`[WORKFLOW 1] No se pudieron extraer datos del stream en directo con ID: ${videoId}`);
          }
        } else {
          logger.info("[WORKFLOW 1] No hay streams en directo actualmente");
        }
      } catch (error) {
        logger.error("[WORKFLOW 1] Error al obtener streams en directo:", error);
      }

      // Paso 2: Obtener streams futuros
      logger.info("[WORKFLOW 1] Buscando próximos streams programados...");
      try {
        const upcomingStreams = await youtubeUtils.getUpcomingStreams();
        logger.debug(
          `[WORKFLOW 1] Número de streams futuros encontrados: ${
            upcomingStreams.items ? upcomingStreams.items.length : 0
          }`
        );

        if (upcomingStreams.items && upcomingStreams.items.length > 0) {
          logger.info(`[WORKFLOW 1] Procesando ${upcomingStreams.items.length} streams futuros`);

          for (const item of upcomingStreams.items) {
            try {
              const videoId = item.id.videoId;
              logger.info(`[WORKFLOW 1] Procesando stream futuro con ID: ${videoId}`);

              const stats = await youtubeUtils.getOngoingStats(videoId);
              const streamData = extractStreamData(videoId, stats);

              if (streamData) {
                const scheduledStart = new Date(streamData.scheduledStart);
                logger.info(
                  `[WORKFLOW 1] Stream "${streamData.title}" programado para: ${scheduledStart.toISOString()}`
                );

                // Añadir si es válido y no es un horario semanal
                if (
                  (scheduledStart > nowDate || isStreamValid(scheduledStart, nowDate)) &&
                  !streamData.title.includes("【HORARIO SEMANAL】 Free chat! || GalaYaki")
                ) {
                  upcomingStreamsArray.push(streamData);
                  logger.info(`[WORKFLOW 1] Stream futuro añadido: "${streamData.title}"`);
                } else {
                  if (!isStreamValid(scheduledStart, nowDate)) {
                    logger.info(`[WORKFLOW 1] Stream "${streamData.title}" demasiado antiguo, ignorado`);
                  }
                  if (streamData.title.includes("【HORARIO SEMANAL】")) {
                    logger.info(`[WORKFLOW 1] Stream "${streamData.title}" es horario semanal, ignorado`);
                  }
                }
              } else {
                logger.warn(`[WORKFLOW 1] No se pudieron extraer datos del stream con ID: ${videoId}`);
              }
            } catch (itemError) {
              logger.warn(`[WORKFLOW 1] Error al procesar stream individual: ${itemError.message}`);
              continue; // Continuar con el siguiente stream si hay error
            }
          }
        } else {
          logger.info("[WORKFLOW 1] No se encontraron streams programados");
        }
      } catch (error) {
        logger.error("[WORKFLOW 1] Error al obtener próximos streams:", error);
      }

      // Paso 3: Guardar todos los streams encontrados
      logger.info(`[WORKFLOW 1] Guardando ${upcomingStreamsArray.length} streams en el archivo`);
      writeJSON(upcomingStreamsFile, upcomingStreamsArray);

      // Paso 4: Determinar el próximo stream
      logger.info("[WORKFLOW 1] Ordenando streams por fecha");
      upcomingStreamsArray.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

      let nextStream = null;
      if (ongoingStream) {
        nextStream = ongoingStream;
        logger.info(`[WORKFLOW 1] Stream en directo seleccionado como próximo: "${nextStream.title}"`);
      } else if (upcomingStreamsArray.length > 0) {
        nextStream = upcomingStreamsArray[0];
        logger.info(`[WORKFLOW 1] Stream futuro seleccionado como próximo: "${nextStream.title}"`);
      } else {
        logger.warn("[WORKFLOW 1] No se encontraron streams para definir como próximo");
      }

      // Paso 5: Guardar el próximo stream si es válido
      if (nextStream) {
        const streamStart = new Date(nextStream.scheduledStart);
        logger.info(`[WORKFLOW 1] Validando próximo stream: "${nextStream.title}" (${streamStart.toISOString()})`);

        if (isStreamValid(streamStart, nowDate)) {
          // Verificar si ya teníamos este stream guardado
          try {
            const existingData = require(nextUpcomingStreamFile);
            if (existingData && existingData.videoId === nextStream.videoId) {
              nextStream.embedSent = existingData.embedSent || false;
              logger.info(
                `[WORKFLOW 1] Preservando estado de embed para stream existente: ${
                  nextStream.embedSent ? "ya enviado" : "no enviado"
                }`
              );
            } else {
              logger.info(`[WORKFLOW 1] Nuevo stream detectado, estado de embed reiniciado`);
            }
          } catch (e) {
            logger.warn(`[WORKFLOW 1] Error al leer el archivo de próximo stream: ${e.message}`);
          }

          writeJSON(nextUpcomingStreamFile, nextStream);
          logger.info(`[WORKFLOW 1] Próximo stream guardado: "${nextStream.title}" (${streamStart.toISOString()})`);
        } else {
          logger.warn(`[WORKFLOW 1] Stream demasiado antiguo para ser guardado: "${nextStream.title}"`);
          writeJSON(nextUpcomingStreamFile, {});
        }
      } else {
        logger.warn("[WORKFLOW 1] No se encontró ningún próximo stream para guardar");
        writeJSON(nextUpcomingStreamFile, {});
      }

      logger.info("===== WORKFLOW DE ACTUALIZACIÓN COMPLETADO =====");
      return upcomingStreamsArray;
    } catch (error) {
      logger.error("[WORKFLOW 1] Error crítico en updateWorkflow:", error);
      return [];
    }
  },

  // Workflow 2: Check every minute if the stream is now live
  async checkFunction(logger) {
    try {
      logger.info("===== INICIANDO VERIFICACIÓN DE STREAM EN DIRECTO =====");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      const upcomingStreamsFile = getFilePath("upcomingStreams.json");

      logger.info(`[WORKFLOW 2] Archivos: ${nextUpcomingStreamFile}, ${upcomingStreamsFile}`);
      ensureFileExists(nextUpcomingStreamFile);
      ensureFileExists(upcomingStreamsFile);

      let nextUpcomingStream;
      try {
        nextUpcomingStream = require(nextUpcomingStreamFile);
        logger.debug(`[WORKFLOW 2] Datos del próximo stream: ${JSON.stringify(nextUpcomingStream)}`);
      } catch (error) {
        logger.warn(`[WORKFLOW 2] Error al cargar el archivo nextUpcomingStream.json: ${error.message}`);
        return false;
      }

      const now = new Date();
      logger.info(`[WORKFLOW 2] Fecha actual: ${now.toISOString()}`);

      // Salir si no hay datos para comprobar
      if (!nextUpcomingStream || !nextUpcomingStream.videoId) {
        logger.info("[WORKFLOW 2] No hay datos de stream para comprobar");
        return false;
      }

      const streamDate = new Date(nextUpcomingStream.scheduledStart);
      logger.info(`[WORKFLOW 2] Verificando stream: "${nextUpcomingStream.title}" (${streamDate.toISOString()})`);
      logger.info(`[WORKFLOW 2] Diferencia de tiempo: ${Math.round((now - streamDate) / (60 * 1000))} minutos`);

      // Si el stream es demasiado antiguo, buscar uno nuevo
      if (!isStreamValid(streamDate, now)) {
        logger.info(`[WORKFLOW 2] Stream demasiado antiguo. Buscando reemplazo.`);

        let upcomingStreams = [];
        try {
          upcomingStreams = require(upcomingStreamsFile);
          logger.info(`[WORKFLOW 2] ${upcomingStreams.length} streams disponibles para reemplazo`);
        } catch (error) {
          logger.warn(`[WORKFLOW 2] Error al cargar upcomingStreams.json: ${error.message}`);
          upcomingStreams = [];
        }

        if (Array.isArray(upcomingStreams) && upcomingStreams.length > 0) {
          // Filtrar streams válidos
          logger.info(`[WORKFLOW 2] Filtrando streams válidos desde una lista de ${upcomingStreams.length} streams`);
          const validStreams = upcomingStreams
            .filter((stream) => {
              const streamTime = new Date(stream.scheduledStart);
              const isValid = isStreamValid(streamTime, now);
              logger.debug(`[WORKFLOW 2] Stream "${stream.title}" - Válido: ${isValid}`);
              return isValid;
            })
            .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

          logger.info(`[WORKFLOW 2] ${validStreams.length} streams válidos encontrados`);

          if (validStreams.length > 0) {
            const newNextStream = validStreams[0];
            logger.info(`[WORKFLOW 2] Nuevo stream seleccionado: "${newNextStream.title}"`);

            // Evitar bucle infinito con el mismo stream
            if (newNextStream.videoId === nextUpcomingStream.videoId) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              newNextStream.scheduledStart = tomorrow.toISOString();
              logger.warn(
                `[WORKFLOW 2] Mismo stream encontrado, ajustando fecha para evitar bucle: ${tomorrow.toISOString()}`
              );
            }

            newNextStream.embedSent = false;
            writeJSON(nextUpcomingStreamFile, newNextStream);
            logger.info(`[WORKFLOW 2] Nuevo stream guardado como próximo: "${newNextStream.title}"`);

            logger.info(`[WORKFLOW 2] Verificando inmediatamente si el nuevo stream está en directo`);
            return await checkStreamLive(newNextStream, logger);
          } else {
            logger.warn("[WORKFLOW 2] No se encontraron streams válidos para reemplazo");
            writeJSON(nextUpcomingStreamFile, {});
            return false;
          }
        } else {
          logger.warn("[WORKFLOW 2] No hay lista de streams futuros disponible para reemplazo");
          return false;
        }
      }

      // Comprobar si el stream está en directo
      logger.info(`[WORKFLOW 2] Verificando si el stream "${nextUpcomingStream.title}" está en directo`);
      const result = await checkStreamLive(nextUpcomingStream, logger);
      logger.info(`[WORKFLOW 2] Resultado: ${result ? "STREAM EN DIRECTO" : "No está en directo"}`);
      return result;
    } catch (error) {
      logger.error("[WORKFLOW 2] Error crítico en checkFunction:", error);
      return false;
    }
  },

  // Workflow 3: Send embed notification when a stream goes live
  async sendEmbed(client, nextLiveData, logger) {
    try {
      logger.info("===== INICIANDO ENVÍO DE NOTIFICACIÓN DE STREAM =====");
      logger.info(
        `[WORKFLOW 3] Preparando notificación para stream: "${nextLiveData.title}" (ID: ${nextLiveData.videoId})`
      );

      // Crear Discord embed para el stream en directo
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

      // Obtener el canal de Discord
      logger.info(`[WORKFLOW 3] Obteniendo canal de Discord: ${process.env.GALAYAKI_YTDISCORD}`);
      let channel;
      try {
        channel = await client.channels.fetch(process.env.GALAYAKI_YTDISCORD);
        if (!channel) {
          throw new Error("Canal no encontrado");
        }
        logger.info(`[WORKFLOW 3] Canal encontrado: ${channel.name} (${channel.id})`);
      } catch (err) {
        logger.error(`[WORKFLOW 3] Error al obtener el canal de Discord: ${err.message}`, err);
        return;
      }

      // Intentar enviar el mensaje con botón
      logger.info("[WORKFLOW 3] Intentando enviar mensaje con botón...");
      try {
        await channel.send({
          content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
          embeds: [embed],
          components: [button],
        });
        logger.info("[WORKFLOW 3] ✅ Notificación con botón enviada correctamente");
        saveEmbedStatus(true, logger);

        // Actualizar estado del stream
        logger.info("[WORKFLOW 3] Actualizando estado del stream para evitar duplicados");
        const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
        try {
          const nextStream = require(nextUpcomingStreamFile);
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            logger.info("[WORKFLOW 3] Estado del stream actualizado correctamente");
          } else {
            logger.warn("[WORKFLOW 3] El stream actual ya no coincide con el notificado");
          }
        } catch (updateError) {
          logger.error(`[WORKFLOW 3] Error al actualizar estado del stream: ${updateError.message}`);
        }
      } catch (err) {
        // Fallback sin botón
        logger.warn(`[WORKFLOW 3] Error al enviar notificación con botón: ${err.message}`);
        logger.info("[WORKFLOW 3] Intentando enviar mensaje sin botón (fallback)...");

        try {
          await channel.send({
            content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
            embeds: [embed],
          });
          logger.info("[WORKFLOW 3] ✅ Notificación sin botón enviada correctamente");
          saveEmbedStatus(true, logger);

          // Actualizar estado
          const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
          const nextStream = require(nextUpcomingStreamFile);
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            logger.info("[WORKFLOW 3] Estado del stream actualizado correctamente");
          }
        } catch (finalError) {
          logger.error(`[WORKFLOW 3] Error fatal al enviar notificación fallback: ${finalError.message}`, finalError);
        }
      }

      logger.info("===== ENVÍO DE NOTIFICACIÓN COMPLETADO =====");
    } catch (error) {
      logger.error(`[WORKFLOW 3] Error crítico en sendEmbed: ${error.message}`, error);
    }
  },
};

module.exports = {
  youtubeUtils,
  workflows,
};
