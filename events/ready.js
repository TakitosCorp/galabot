const { ActivityType } = require("discord.js");
const cron = require("node-cron");
const { workflows } = require("../functions/youtube");

let nextLiveVideoId = null;
let randomStatusInterval = null;

module.exports = {
  name: "ready",
  async execute(client, logger) {
    logger.info(`[✅] ${client.user.username} se ha conectado correctamente a Discord!`);

    const statusMessages = [
      "Vigilando a los takitos",
      "Esperando el stream de Galita",
      "Leyendo lo que escribes...",
      "Comiendo pulpo a la gallega",
      "Que haces leyendo esto?",
      "Protegiendo a los takitos",
      "Reclutando takitos",
      "Nada de portarse mal eh!",
      "No menciones a Gala!",
      "Evadiendo impuestos",
    ];

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence(client, logger) {
      const liveStatus = await workflows.checkFunction(client);

      if (liveStatus) {
        const nextLiveData = require("../data/nextUpcomingStream.json");
        if (nextLiveData) {
          client.user.setActivity({
            name: nextLiveData.title,
            type: ActivityType.Streaming,
            url: nextLiveData.streamUrl,
          });
        } else {
          logger.warn("No se pudieron cargar los datos del próximo directo.");
        }
        if (randomStatusInterval) {
          clearInterval(randomStatusInterval);
          randomStatusInterval = null;
        }
      } else {
        setRandomStatus();
        if (!randomStatusInterval) {
          randomStatusInterval = setInterval(setRandomStatus, 300000);
        }
      }
    }

    (async () => {
      logger.warn("Actualizando el próximo directo al iniciar.");
      await workflows.updateWorkflow();
      const nextLiveData = require("../data/nextUpcomingStream.json");
      if (nextLiveData) {
        nextLiveVideoId = nextLiveData.videoId;
      } else {
        logger.warn("No se encontraron datos del próximo directo al iniciar. Creando datos iniciales.");
        await workflows.updateWorkflow();
      }
      await updatePresence(client, logger);
    })();

    const nextLiveData = require("../data/nextUpcomingStream.json");
    if (nextLiveData) {
      logger.warn(`Datos del próximo directo cargados al iniciar: ${JSON.stringify(nextLiveData)}`);
      nextLiveVideoId = nextLiveData.videoId;
      const currentTime = Date.now();
      const lastUpdateTime = new Date(nextLiveData.scheduledStart).getTime();
      const hoursSinceLastUpdate = (currentTime - lastUpdateTime) / (1000 * 60 * 60);

      if (hoursSinceLastUpdate > 6) {
        logger.warn("Han pasado más de 6 horas desde la última actualización. Actualizando el próximo directo.");
        await workflows.updateWorkflow();
      }
    } else {
      logger.warn("No se encontraron datos del próximo directo al iniciar.");
    }

    cron.schedule("0 */3 * * *", async () => {
      await workflows.updateWorkflow();
      await updatePresence(client, logger);
    });

    cron.schedule("* * * * *", async () => {
      await updatePresence(client, logger);
    });
  },
};
