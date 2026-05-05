/**
 * Clean stream titles by removing provider-specific markers.
 * Removes `||` and `#galagao` markers that clutter displays.
 *
 * @param {string} title - The raw stream title from the provider
 * @returns {string} Cleaned title or "No title" if empty
 */
function cleanStreamTitle(title) {
  if (!title || typeof title !== "string") {
    return "No title";
  }

  return title
    .replace(/\|\|/g, "") // Remove || markers
    .replace(/#galagao/gi, "") // Remove #galagao (case-insensitive)
    .replace(/\s{2,}/g, " ") // Collapse multiple spaces to single space
    .trim(); // Trim leading/trailing whitespace
}

module.exports = { cleanStreamTitle };
