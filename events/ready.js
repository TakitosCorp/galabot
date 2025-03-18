const { ActivityType } = require("discord.js");
const cron = require("node-cron");
const { workflows } = require("../functions/youtube");
const { writeJSON, getFilePath, ensureFileExists } = require("../utils/fileUtils.js");
const resources = require("../data/resources.json");

let nextLiveVideoId = null;
let randomStatusInterval = null;
const nextUpcomingStreamFile = getFilePath("nextUpcomingStream.json");

ensureFileExists(nextUpcomingStreamFile);

module.exports = {
  name: "ready",
  async execute(client, logger) {
    logger.info(`[✅] ${client.user.username} se ha conectado correctamente a Discord!`);

    const statusMessages = resources.statusMessages;

    function setRandomStatus() {
      const randomStatus = statusMessages[Math.floor(Math.random() * statusMessages.length)];
      client.user.setActivity(randomStatus, { type: ActivityType.Custom });
    }

    async function updatePresence(client, logger) {
      const liveStatus = await workflows.checkFunction();
      console.log("Live status según checkFunction:" + liveStatus);
      if (liveStatus) {
        const nextLiveData = require("../data/nextUpcomingStream.json");
        if (nextLiveData) {
          client.user.setActivity({
            name: nextLiveData.title,
            type: ActivityType.Streaming,
            url: nextLiveData.streamUrl,
          });
          if (nextLiveData.embedSent === false) {
            await workflows.sendEmbed(client, nextLiveData, logger);
            nextLiveData.embedSent = true;
            writeJSON(nextUpcomingStreamFile, nextLiveData);
          }
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

    async function initialSetup() {
      logger.warn("Actualizando datos al iniciar el bot.");
      await workflows.updateWorkflow(logger);
      const nextLiveData = require("../data/nextUpcomingStream.json");
      if (nextLiveData) {
        nextLiveVideoId = nextLiveData.videoId;
      } else {
        logger.warn("No se encontraron datos del próximo directo al iniciar. Creando datos iniciales.");
        await workflows.updateWorkflow(logger);
      }
      await updatePresence(client, logger);
    }

    async function scheduledTasks() {
      await workflows.updateWorkflow(logger);
      await updatePresence(client, logger);
    }

    await initialSetup();

    cron.schedule("0 */3 * * *", async () => {
      logger.info("Ejecutando tarea programada: Actualizar workflow y presencia.");
      await scheduledTasks();
    });

    cron.schedule("* * * * *", async () => {
      logger.info("Ejecutando tarea programada: Detectar si hay streams en progreso.");
      await updatePresence(client, logger);
    });
  },
};
