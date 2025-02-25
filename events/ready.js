const { ActivityType } = require("discord.js");
const cron = require("node-cron");
const { updateNextLiveVideo, isLive, loadNextLiveVideoId } = require("../functions/checkLive");

let nextLiveVideoId = null;
let randomStatusInterval = null;

module.exports = {
  name: "ready",
  execute(client, logger) {
    logger.info(`[✅] ${client.user.username} se ha conectado correctamente a Discord!`);

    const statusMessages = [
      "Vigilando a los takitos",
      "Esperando el stream de Galita",
      "Leyendo lo que escribes...",
      "Comiendo pulpo a la gallega",
      "Que haces leyendo esto?",
      "Protegiendo a los takitos",
      "Reclutando takitos",
      "Vigilando que se cumplan las reglas",
      "No menciones a Gala!",
      "Evadiendo impuestos",
    ];

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence(client, logger) {
      logger.warn("Iniciando la actualización de la presencia.");
      const liveStatus = await isLive(logger, client);

      if (liveStatus) {
        logger.info("El canal está en directo.");
        const nextLiveData = loadNextLiveVideoId();
        if (nextLiveData) {
          logger.warn(`Datos del próximo directo cargados: ${JSON.stringify(nextLiveData)}`);
          client.user.setActivity({
            name: nextLiveData.title,
            type: ActivityType.Streaming,
            url: nextLiveData.url,
          });
        } else {
          logger.warn("No se pudieron cargar los datos del próximo directo.");
        }
        if (randomStatusInterval) {
          clearInterval(randomStatusInterval);
          randomStatusInterval = null;
        }
      } else {
        logger.info("El canal no está en directo.");
        setRandomStatus();
        if (!randomStatusInterval) {
          randomStatusInterval = setInterval(setRandomStatus, 300000);
        }
      }
    }

    (async () => {
      logger.warn("Actualizando el próximo directo al iniciar.");
      await updateNextLiveVideo(logger);
      const nextLiveData = loadNextLiveVideoId();
      if (nextLiveData) {
        nextLiveVideoId = nextLiveData.videoId;
      }
      await updatePresence(client, logger);
    })();

    const nextLiveData = loadNextLiveVideoId();
    if (nextLiveData) {
      logger.warn(`Datos del próximo directo cargados al iniciar: ${JSON.stringify(nextLiveData)}`);
      nextLiveVideoId = nextLiveData.videoId;
      const currentTime = Date.now();
      const lastUpdateTime = nextLiveData.timestamp;
      const hoursSinceLastUpdate = (currentTime - lastUpdateTime) / (1000 * 60 * 60);

      if (hoursSinceLastUpdate > 24) {
        logger.warn("Han pasado más de 24 horas desde la última actualización. Actualizando el próximo directo.");
        updateNextLiveVideo(logger);
      }
    } else {
      logger.warn("No se encontraron datos del próximo directo al iniciar.");
    }

    cron.schedule("0 4 * * *", async () => {
      logger.warn("Ejecutando tarea programada para actualizar el próximo directo.");
      await updateNextLiveVideo(logger);
      await updatePresence(client, logger);
    });

    cron.schedule("* * * * *", async () => {
      logger.warn("Ejecutando tarea programada para comprobar el estado del directo.");
      await updatePresence(client, logger);
    });
  },
};
