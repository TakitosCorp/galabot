const dotenv = require("dotenv");
const axios = require("axios");
const { getFilePath, writeJSON, ensureFileExists } = require("../utils/fileUtils");
const { 
  workflowUpdateLogger, 
  workflowCheckLogger, 
  workflowNotifyLogger, 
  liveCheckLogger, 
  streamDataLogger,
  notificationLogger, 
  embedLogger,
  youtubeApiLogger
} = require("../loggers/index");

// Load environment variables
dotenv.config();
const apiKey = process.env.GALAYAKI_YTAPIKEY;
const channelId = process.env.GALAYAKI_YTCHANNELID;

// YouTube API utility functions
const youtubeUtils = {
  async getUpcomingStreams() {
    youtubeApiLogger.info("Obteniendo streams programados del canal");
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=upcoming&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    youtubeApiLogger.debug(`Respuesta recibida: ${response.data.items ? response.data.items.length : 0} resultados`);
    return response.data;
  },

  async getOngoingStream() {
    youtubeApiLogger.info("Obteniendo streams en directo del canal");
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const response = await axios.get(url);
    youtubeApiLogger.debug(`Respuesta recibida: ${response.data.items ? response.data.items.length : 0} resultados en directo`);
    return response.data;
  },

  async getOngoingStats(videoId) {
    youtubeApiLogger.info(`Obteniendo estadísticas para el video: ${videoId}`);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${apiKey}`;
    const response = await axios.get(url);
    youtubeApiLogger.debug(`Datos de estadísticas recibidos para ${videoId}`);
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

  streamDataLogger.info(`Datos extraídos para stream "${streamData.snippet.title}" (ID: ${videoId})`);
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
function saveEmbedStatus(status) {
  try {
    const embedStatusFile = getFilePath("embedStatus.json");
    ensureFileExists(embedStatusFile);
    writeJSON(embedStatusFile, { sent: status });
    embedLogger.info(`Estado del embed actualizado: ${status ? "enviado" : "no enviado"}`);
  } catch (error) {
    embedLogger.error("Error al guardar el estado del embed:", error);
  }
}

// Helper function para comprobar si un stream está en directo
async function checkStreamLive(stream) {
  try {
    const now = new Date();
    const streamDate = new Date(stream.scheduledStart);

    liveCheckLogger.info(`Comprobando stream: "${stream.title}" (ID: ${stream.videoId})`);
    liveCheckLogger.debug(`Fecha programada: ${streamDate.toISOString()}, Diferencia: ${Math.round((now - streamDate) / (60 * 1000))} minutos`);

    // Obtener estadísticas en tiempo real del stream
    liveCheckLogger.info(`Obteniendo estadísticas en vivo para: ${stream.videoId}`);
    const ongoingStats = await youtubeUtils.getOngoingStats(stream.videoId);

    // Verificar si hay estadísticas disponibles
    if (!ongoingStats || !ongoingStats.items || ongoingStats.items.length === 0) {
      liveCheckLogger.warn(`No hay estadísticas disponibles para el stream ${stream.videoId}`);
      return false;
    }

    const liveDetails = ongoingStats.items[0].liveStreamingDetails;
    liveCheckLogger.debug(`Detalles recibidos: ${JSON.stringify(liveDetails)}`);

    // Comprobar si el stream está en directo (tiene espectadores)
    if (liveDetails && liveDetails.concurrentViewers) {
      liveCheckLogger.info(`¡Stream en directo! Espectadores actuales: ${liveDetails.concurrentViewers}`);
      return true;
    } else {
      if (liveDetails) {
        if (liveDetails.actualStartTime) {
          liveCheckLogger.info(`Stream iniciado pero sin datos de espectadores. Hora de inicio: ${liveDetails.actualStartTime}`);
        } else if (liveDetails.scheduledStartTime) {
          const scheduledDate = new Date(liveDetails.scheduledStartTime);
          const minutesToStart = Math.round((scheduledDate - now) / (60 * 1000));
          liveCheckLogger.info(`Stream programado para iniciar en ${minutesToStart} minutos (${scheduledDate.toISOString()})`);
        }
      } else {
        liveCheckLogger.warn(`No hay detalles de transmisión disponibles para ${stream.videoId}`);
      }
      return false;
    }
  } catch (error) {
    liveCheckLogger.error(`Error al comprobar si el stream está en directo: ${error.message}`, error);
    return false;
  }
}

// Workflow implementation
const workflows = {
  // Workflow 1: Update stream information every 4 hours
  async updateWorkflow() {
    try {
      workflowUpdateLogger.info("===== WORKFLOW DE ACTUALIZACIÓN INICIADO =====");
      const nowDate = new Date();
      
      const upcomingStreamsFile = getFilePath("upcomingStreams.json");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      workflowUpdateLogger.info(`Preparando archivos de datos`);

      const upcomingStreamsArray = [];
      ensureFileExists(upcomingStreamsFile);
      ensureFileExists(nextUpcomingStreamFile);

      // Paso 1: Obtener stream en directo si existe
      workflowUpdateLogger.info("Buscando streams en directo actualmente");
      let ongoingStream = null;
      try {
        const ongoingStreamData = await youtubeUtils.getOngoingStream();
        
        if (ongoingStreamData.items && ongoingStreamData.items.length > 0) {
          const videoId = ongoingStreamData.items[0].id.videoId;
          workflowUpdateLogger.info(`Stream en directo detectado con ID: ${videoId}`);

          const stats = await youtubeUtils.getOngoingStats(videoId);
          const streamData = extractStreamData(videoId, stats);
          if (streamData) {
            ongoingStream = streamData;
            upcomingStreamsArray.push(ongoingStream);
            workflowUpdateLogger.info(`Stream en directo añadido: "${ongoingStream.title}"`);
          } else {
            workflowUpdateLogger.warn(`No se pudieron extraer datos del stream en directo con ID: ${videoId}`);
          }
        } else {
          workflowUpdateLogger.info("No hay streams en directo actualmente");
        }
      } catch (error) {
        workflowUpdateLogger.error("Error al obtener streams en directo:", error);
      }

      // Paso 2: Obtener streams futuros
      workflowUpdateLogger.info("Buscando próximos streams programados");
      try {
        const upcomingStreams = await youtubeUtils.getUpcomingStreams();
        
        if (upcomingStreams.items && upcomingStreams.items.length > 0) {
          workflowUpdateLogger.info(`Procesando ${upcomingStreams.items.length} streams futuros`);

          for (const item of upcomingStreams.items) {
            try {
              const videoId = item.id.videoId;
              streamDataLogger.info(`Procesando stream con ID: ${videoId}`);

              const stats = await youtubeUtils.getOngoingStats(videoId);
              const streamData = extractStreamData(videoId, stats);

              if (streamData) {
                const scheduledStart = new Date(streamData.scheduledStart);
                streamDataLogger.info(`Stream "${streamData.title}" programado para: ${scheduledStart.toISOString()}`);

                // Añadir si es válido y no es un horario semanal
                if (
                  (scheduledStart > nowDate || isStreamValid(scheduledStart, nowDate)) &&
                  !streamData.title.includes("【HORARIO SEMANAL】 Free chat! || GalaYaki")
                ) {
                  upcomingStreamsArray.push(streamData);
                  streamDataLogger.info(`Stream futuro añadido: "${streamData.title}"`);
                } else {
                  if (!isStreamValid(scheduledStart, nowDate)) {
                    streamDataLogger.info(`Stream "${streamData.title}" demasiado antiguo, ignorado`);
                  }
                  if (streamData.title.includes("【HORARIO SEMANAL】")) {
                    streamDataLogger.info(`Stream "${streamData.title}" es horario semanal, ignorado`);
                  }
                }
              } else {
                streamDataLogger.warn(`No se pudieron extraer datos del stream con ID: ${videoId}`);
              }
            } catch (itemError) {
              streamDataLogger.warn(`Error al procesar stream individual: ${itemError.message}`);
              continue; // Continuar con el siguiente stream si hay error
            }
          }
        } else {
          workflowUpdateLogger.info("No se encontraron streams programados");
        }
      } catch (error) {
        workflowUpdateLogger.error("Error al obtener próximos streams:", error);
      }

      // Paso 3: Guardar todos los streams encontrados
      workflowUpdateLogger.info(`Guardando ${upcomingStreamsArray.length} streams en el archivo`);
      writeJSON(upcomingStreamsFile, upcomingStreamsArray);

      // Paso 4: Determinar el próximo stream
      workflowUpdateLogger.info("Ordenando streams por fecha");
      upcomingStreamsArray.sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

      let nextStream = null;
      if (ongoingStream) {
        nextStream = ongoingStream;
        workflowUpdateLogger.info(`Stream en directo seleccionado como próximo: "${nextStream.title}"`);
      } else if (upcomingStreamsArray.length > 0) {
        nextStream = upcomingStreamsArray[0];
        workflowUpdateLogger.info(`Stream futuro seleccionado como próximo: "${nextStream.title}"`);
      } else {
        workflowUpdateLogger.warn("No se encontraron streams para definir como próximo");
      }

      // Paso 5: Guardar el próximo stream si es válido
      if (nextStream) {
        const streamStart = new Date(nextStream.scheduledStart);
        workflowUpdateLogger.info(`Validando próximo stream: "${nextStream.title}" (${streamStart.toISOString()})`);

        if (isStreamValid(streamStart, nowDate)) {
          // Verificar si ya teníamos este stream guardado
          try {
            const existingData = require(nextUpcomingStreamFile);
            if (existingData && existingData.videoId === nextStream.videoId) {
              nextStream.embedSent = existingData.embedSent || false;
              workflowUpdateLogger.info(`Preservando estado de embed: ${nextStream.embedSent ? "ya enviado" : "no enviado"}`);
            } else {
              workflowUpdateLogger.info(`Nuevo stream detectado, estado de embed reiniciado`);
            }
          } catch (e) {
            workflowUpdateLogger.warn(`Error al leer el archivo de próximo stream: ${e.message}`);
          }

          writeJSON(nextUpcomingStreamFile, nextStream);
          workflowUpdateLogger.info(`Próximo stream guardado: "${nextStream.title}"`);
        } else {
          workflowUpdateLogger.warn(`Stream demasiado antiguo para ser guardado: "${nextStream.title}"`);
          writeJSON(nextUpcomingStreamFile, {});
        }
      } else {
        workflowUpdateLogger.warn("No se encontró ningún próximo stream para guardar");
        writeJSON(nextUpcomingStreamFile, {});
      }

      workflowUpdateLogger.info("===== WORKFLOW DE ACTUALIZACIÓN COMPLETADO =====");
      return upcomingStreamsArray;
    } catch (error) {
      workflowUpdateLogger.error("Error en actualización", error);
      return [];
    }
  },

  // Workflow 2: Check every minute if the stream is now live
  async checkFunction() {
    try {
      workflowCheckLogger.info("Verificando streams en directo");
      const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
      const upcomingStreamsFile = getFilePath("upcomingStreams.json");

      ensureFileExists(nextUpcomingStreamFile);
      ensureFileExists(upcomingStreamsFile);

      let nextUpcomingStream;
      try {
        nextUpcomingStream = require(nextUpcomingStreamFile);
        workflowCheckLogger.debug(`Datos del próximo stream cargados`);
      } catch (error) {
        workflowCheckLogger.warn(`Error al cargar el archivo nextUpcomingStream.json: ${error.message}`);
        return false;
      }

      const now = new Date();

      // Salir si no hay datos para comprobar
      if (!nextUpcomingStream || !nextUpcomingStream.videoId) {
        workflowCheckLogger.info("No hay datos de stream para comprobar");
        return false;
      }

      const streamDate = new Date(nextUpcomingStream.scheduledStart);
      workflowCheckLogger.info(`Verificando stream: "${nextUpcomingStream.title}"`);

      // Si el stream es demasiado antiguo, buscar uno nuevo
      if (!isStreamValid(streamDate, now)) {
        workflowCheckLogger.info(`Stream demasiado antiguo. Buscando reemplazo.`);

        let upcomingStreams = [];
        try {
          upcomingStreams = require(upcomingStreamsFile);
          workflowCheckLogger.info(`${upcomingStreams.length} streams disponibles para reemplazo`);
        } catch (error) {
          workflowCheckLogger.warn(`Error al cargar upcomingStreams.json: ${error.message}`);
          upcomingStreams = [];
        }

        if (Array.isArray(upcomingStreams) && upcomingStreams.length > 0) {
          // Filtrar streams válidos
          workflowCheckLogger.info(`Filtrando streams válidos de ${upcomingStreams.length} disponibles`);
          const validStreams = upcomingStreams
            .filter((stream) => {
              const streamTime = new Date(stream.scheduledStart);
              const isValid = isStreamValid(streamTime, now);
              workflowCheckLogger.debug(`Stream "${stream.title}" - Válido: ${isValid}`);
              return isValid;
            })
            .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

          workflowCheckLogger.info(`${validStreams.length} streams válidos encontrados`);

          if (validStreams.length > 0) {
            const newNextStream = validStreams[0];
            workflowCheckLogger.info(`Nuevo stream seleccionado: "${newNextStream.title}"`);

            // Evitar bucle infinito con el mismo stream
            if (newNextStream.videoId === nextUpcomingStream.videoId) {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              newNextStream.scheduledStart = tomorrow.toISOString();
              workflowCheckLogger.warn(`Mismo stream encontrado, ajustando fecha para evitar bucle`);
            }

            newNextStream.embedSent = false;
            writeJSON(nextUpcomingStreamFile, newNextStream);
            workflowCheckLogger.info(`Nuevo stream guardado como próximo: "${newNextStream.title}"`);

            workflowCheckLogger.info(`Verificando inmediatamente si el nuevo stream está en directo`);
            return await checkStreamLive(newNextStream);
          } else {
            workflowCheckLogger.warn("No se encontraron streams válidos para reemplazo");
            writeJSON(nextUpcomingStreamFile, {});
            return false;
          }
        } else {
          workflowCheckLogger.warn("No hay lista de streams futuros disponible para reemplazo");
          return false;
        }
      }

      // Comprobar si el stream está en directo
      workflowCheckLogger.info(`Verificando si el stream "${nextUpcomingStream.title}" está en directo`);
      const result = await checkStreamLive(nextUpcomingStream);
      workflowCheckLogger.info(`Resultado: ${result ? "STREAM EN DIRECTO" : "No está en directo"}`);
      return result;
    } catch (error) {
      workflowCheckLogger.error("Error en verificación", error);
      return false;
    }
  },

  // Workflow 3: Send embed notification when a stream goes live
  async sendEmbed(client, nextLiveData) {
    try {
      workflowNotifyLogger.info(`Enviando notificación para: ${nextLiveData.title}`);

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

      // Intentar enviar el mensaje con botón
      embedLogger.info("Intentando enviar mensaje con botón");
      try {
        await channel.send({
          content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
          embeds: [embed],
          components: [button],
        });
        embedLogger.info("✅ Notificación con botón enviada correctamente");
        saveEmbedStatus(true);

        // Actualizar estado del stream
        workflowNotifyLogger.info("Actualizando estado del stream para evitar duplicados");
        const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
        try {
          const nextStream = require(nextUpcomingStreamFile);
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            workflowNotifyLogger.info("Estado del stream actualizado correctamente");
          } else {
            workflowNotifyLogger.warn("El stream actual ya no coincide con el notificado");
          }
        } catch (updateError) {
          workflowNotifyLogger.error(`Error al actualizar estado del stream: ${updateError.message}`);
        }
      } catch (err) {
        // Fallback sin botón
        embedLogger.warn(`Error al enviar notificación con botón: ${err.message}`);
        embedLogger.info("Intentando enviar mensaje sin botón (fallback)");

        try {
          await channel.send({
            content: "<@&1080660073564614739> Galita en directo WOOWLWOIOPWOWI",
            embeds: [embed],
          });
          embedLogger.info("✅ Notificación sin botón enviada correctamente");
          saveEmbedStatus(true);

          // Actualizar estado
          const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");
          const nextStream = require(nextUpcomingStreamFile);
          if (nextStream && nextStream.videoId === nextLiveData.videoId) {
            nextStream.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextStream);
            workflowNotifyLogger.info("Estado del stream actualizado correctamente");
          }
        } catch (finalError) {
          embedLogger.error(`Error fatal al enviar notificación fallback: ${finalError.message}`, finalError);
        }
      }

      workflowNotifyLogger.info("===== ENVÍO DE NOTIFICACIÓN COMPLETADO =====");
    } catch (error) {
      workflowNotifyLogger.error("Error al enviar notificación", error);
    }
  },
};

module.exports = {
  youtubeUtils,
  workflows,
};