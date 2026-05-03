/**
 * @module lang/warn
 * @description
 * Localised string tables consumed by {@link module:commands/discord/warn}.
 * Provides embed copy (titles, fields, action labels) for both the timeout
 * flow and the ban-after-3-warns escalation, plus error replies for the
 * various validation failures.
 */

"use strict";

module.exports = {
  en: {
    reasonField: "Reason:",
    actionField: "Actions taken:",
    banTitle: (username) => `Ban issued for ${username}`,
    banReason: "Accumulated 3 or more warnings.",
    banAction: "Permanent server ban.",
    warnTitle: (username) => `Warning and Timeout for ${username}`,
    warnCount: "Total warnings:",
    timeoutDuration: "Timeout duration:",
    timeoutMinutes: (mins) => `${mins} minutes`,
    errNotInServer: "That user is not in this server.",
    errBot: "You cannot warn a bot.",
    errAdmin: "You cannot warn an administrator.",
    errSelf: "You cannot warn yourself.",
    errNoBanPerms: "I don't have permission to ban members.",
    errNoTimeoutPerms:
      "I don't have permission to apply timeouts (moderate members).",
    errBanFailed: (username) => `❌ Banning ${username} failed.`,
    errTimeoutFailed: (username) => `❌ Timeout for ${username} failed.`,
    dmFailBan: (username) => `Could not send ban DM to ${username}.`,
    dmFailWarn: (username) =>
      `Could not send warning/timeout DM to ${username}.`,
    logBanned: (username, by) =>
      `User ${username} banned for accumulated warnings by ${by}.`,
    logTimeout: (username, mins, by) =>
      `Timeout of ${mins}m applied to ${username} by ${by}.`,
    logBanFailed: (username, msg) => `Failed to ban ${username}: ${msg}`,
    logTimeoutFailed: (username, msg) =>
      `Failed to apply timeout to ${username}: ${msg}`,
  },
  es: {
    reasonField: "Razón:",
    actionField: "Acciones tomadas:",
    banTitle: (username) => `Baneo emitido para ${username}`,
    banReason: "Acumulación de 3 o más advertencias.",
    banAction: "Baneo permanente del servidor.",
    warnTitle: (username) => `Advertencia y aislamiento para ${username}`,
    warnCount: "Total de advertencias:",
    timeoutDuration: "Duración del aislamiento:",
    timeoutMinutes: (mins) => `${mins} minutos`,
    errNotInServer: "El usuario no se encuentra en este servidor.",
    errBot: "No puedes advertir a un bot.",
    errAdmin: "No puedes advertir a un administrador.",
    errSelf: "No te puedes advertir a ti mismo.",
    errNoBanPerms: "No tengo permisos para banear miembros.",
    errNoTimeoutPerms:
      "No tengo permisos para aplicar aislamientos (moderar miembros).",
    errBanFailed: (username) => `❌ El baneo de ${username} ha fallado.`,
    errTimeoutFailed: (username) =>
      `❌ El aislamiento para ${username} ha fallado.`,
    dmFailBan: (username) =>
      `No se pudo enviar el mensaje directo de baneo a ${username}.`,
    dmFailWarn: (username) =>
      `No se pudo enviar el mensaje directo de advertencia a ${username}.`,
    logBanned: (username, by) =>
      `Usuario ${username} baneado por acumulación de advertencias por ${by}.`,
    logTimeout: (username, mins, by) =>
      `Aislamiento de ${mins}m aplicado a ${username} por ${by}.`,
    logBanFailed: (username, msg) => `Error al banear a ${username}: ${msg}`,
    logTimeoutFailed: (username, msg) =>
      `Error al aplicar aislamiento a ${username}: ${msg}`,
  },
};
