const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const emojis = require("../data/emojis.json");

const warnsFilePath = path.join(__dirname, "../data/warns.json");

async function handlePing(message, logger) {
  try {
    await message.delete();

    let warns = {};
    if (fs.existsSync(warnsFilePath)) {
      warns = JSON.parse(fs.readFileSync(warnsFilePath, "utf8"));
    }

    const userId = message.author.id;
    if (!warns[userId]) {
      warns[userId] = { count: 0, warnings: [] };
    }
    warns[userId].count += 1;
    warns[userId].warnings.push({ timestamp: Date.now(), reason: "Mencionar a Gala" });

    if (warns[userId].count >= 3) {
      const banEmbed = new EmbedBuilder().setColor(0xff0000).setTitle(`Baneo para ${message.author.tag}`).addFields(
        { name: "Motivo", value: "Has mencionado a Gala repetidamente, lo cual está prohibido según las normativas." },
        {
          name: "Acción",
          value: "Has sido baneado del servidor. Contacta a un administrador si crees que esto es un error.",
        }
      );

      if (message.guild.members.me.permissions.has("BanMembers") && message.member) {
        try {
          await message.author.send({ embeds: [banEmbed] });
        } catch (dmError) {
          logger.warn(`No se pudo enviar un mensaje directo a ${message.author.tag}.`);
        }
        await message.member.ban({ reason: "Mencionar a Gala repetidamente" });
        logger.info(`Usuario ${message.author.tag} baneado por acumular 3 warns.`);
        await message.channel.send({ embeds: [banEmbed] });
      } else {
        logger.error("El bot no tiene permisos suficientes para banear.");
        message.channel.send(
          "No se pudo aplicar el ban porque el bot no tiene permisos suficientes. Contacta a un administrador."
        );
      }
    } else {
      const timeoutDuration = warns[userId].count === 1 ? 10 * 60 * 1000 : 20 * 60 * 1000;
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0x800080)
        .setTitle(`Advertencia para ${message.author.tag}`)
        .addFields(
          {
            name: "Motivo",
            value: `Has mencionado a Gala, lo cual está prohibido según las normativas. ${emojis.galabot_galamad}`,
          },
          {
            name: "Acción",
            value: `Te llevas un timeout de ${
              timeoutDuration / 60000
            } minutos. Aprovecha este tiempo para leer las normas del servidor. ${emojis.galabot_galanotas}`,
          }
        );

      if (message.guild.members.me.permissions.has("ModerateMembers") && message.member) {
        await message.member.timeout(timeoutDuration, "Mencionar a Gala");
        logger.info(`Timeout de ${timeoutDuration / 60000} minutos aplicado a ${message.author.tag}`);
        await message.channel.send({ embeds: [timeoutEmbed] });
      } else {
        logger.error("El bot no tiene permisos suficientes para aplicar un timeout.");
        message.channel.send(
          "No se pudo aplicar el timeout porque el bot no tiene permisos suficientes. Contacta a un administrador."
        );
      }
    }

    fs.writeFileSync(warnsFilePath, JSON.stringify(warns, null, 2), "utf8");
  } catch (error) {
    console.log(error);
    logger.error("Ocurrió un error:", error);
  }
}

module.exports = { handlePing };
