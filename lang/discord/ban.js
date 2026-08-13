/**
 * @module lang/discord/ban
 * @description
 * Localised string tables consumed by {@link module:commands/discord/ban}.
 * Provides embed copy and error replies in English and Spanish.
 */

"use strict";

module.exports = {
  en: {
    reasonField: "Reason:",
    actionField: "Actions taken:",
    deletedField: "Messages deleted:",
    banTitle: (username) => `Ban issued for ${username}`,
    banAction: "Permanent server ban.",
    deletedDays: (n) =>
      n === 0 ? "None" : `Last ${n} day${n === 1 ? "" : "s"}`,
    errNotInServer: "That user is not in this server.",
    errBot: "You cannot ban a bot.",
    errAdmin: "You cannot ban an administrator.",
    errSelf: "You cannot ban yourself.",
    errNotBannable:
      "I cannot ban that user — their highest role is above mine.",
    errNoBanPerms: "I don't have permission to ban members.",
    errBanFailed: (username) => `❌ Banning ${username} failed.`,
  },
  es: {
    reasonField: "Razón:",
    actionField: "Acciones tomadas:",
    deletedField: "Mensajes eliminados:",
    banTitle: (username) => `Baneo emitido para ${username}`,
    banAction: "Baneo permanente del servidor.",
    deletedDays: (n) =>
      n === 0 ? "Ninguno" : `Últimos ${n} día${n === 1 ? "" : "s"}`,
    errNotInServer: "El usuario no se encuentra en este servidor.",
    errBot: "No puedes banear a un bot.",
    errAdmin: "No puedes banear a un administrador.",
    errSelf: "No te puedes banear a ti mismo.",
    errNotBannable:
      "No puedo banear a ese usuario — su rol más alto está por encima del mío.",
    errNoBanPerms: "No tengo permisos para banear miembros.",
    errBanFailed: (username) => `❌ El baneo de ${username} ha fallado.`,
  },
};
