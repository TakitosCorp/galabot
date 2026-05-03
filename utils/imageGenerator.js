/**
 * @module utils/imageGenerator
 * @description
 * Headless-Chromium image renderer used to produce the bot's announcement
 * graphics. Each public function corresponds to a `templates/*.html` file:
 *  - {@link generateStreamBanner} → `streamBanner.html` (live stream embed banner).
 *  - {@link generateFollowupImage} → `streamFollowup.html` (next-streams summary on stream end).
 *  - {@link generateEndedImage} → `streamEnded.html` (generic stream-ended image).
 *
 * A single Puppeteer browser instance is reused across calls and torn down via
 * {@link closeBrowser} during graceful shutdown.
 *
 * @typedef {import('./types').BannerData} BannerData
 * @typedef {import('./types').ScheduleSegment} ScheduleSegment
 */

"use strict";

const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const { sysLog } = require("./loggers");
const {
  PUPPETEER_PAGE_TIMEOUT_MS,
  PUPPETEER_GOTO_TIMEOUT_MS,
  PUPPETEER_SCREENSHOT_TIMEOUT_MS,
  PUPPETEER_SELECTOR_TIMEOUT_MS,
  NEXT_STREAMS_SETTLE_MS,
  BANNER_SETTLE_MS,
} = require("./constants");

/**
 * Reusable Puppeteer browser instance. Lazily created by {@link getBrowser},
 * cleared by {@link closeBrowser}. Module-private.
 * @type {import('puppeteer').Browser|undefined}
 */
let browser;

/**
 * Minimal HTML escaper for the few user-supplied template substitutions
 * (titles, categories, image URLs).
 *
 * @param {unknown} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Lazily create the Puppeteer browser singleton. If a previous instance
 * crashed or was disconnected we transparently spawn a new one.
 *
 * @async
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  if (browser) {
    try {
      await browser.version();
    } catch {
      sysLog("warn", "imageGenerator:browser stale, recreating");
      browser = null;
    }
  }
  if (!browser) {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";
    sysLog("info", "imageGenerator:launching browser", { executablePath });
    browser = await puppeteer.launch({
      headless: "new",
      executablePath,
      devtools: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--max-old-space-size=4096",
      ],
    });
  }
  return browser;
}

/**
 * Build the template variables shared between every image (background palette,
 * link text), parameterised by provider so YouTube and Twitch get distinct looks.
 *
 * @param {("twitch"|"youtube")} provider
 * @returns {Record<string, string>}
 */
function getCommonTemplateVars(provider) {
  const isYt = provider === "youtube";
  return {
    "{{BG_CLASS}}": isYt
      ? "bg-gradient-to-br from-red-600 to-pink-500"
      : "bg-gradient-to-br from-purple-600 to-pink-500",
    "{{LINK_TEXT}}": isYt ? process.env.YOUTUBE_URL : process.env.TWITCH_URL,
  };
}

/**
 * Internal helper: load `templates/<templateName>`, perform string replacements,
 * navigate Puppeteer to the data-URI version of the page, optionally wait for
 * a selector and a settle delay, then return a PNG screenshot of the viewport.
 *
 * @async
 * @param {string} templateName - File name inside `templates/` (e.g. `"streamBanner.html"`).
 * @param {Record<string, string>} replacements - `{{KEY}}` → value table.
 * @param {string|null} waitSelector - Optional CSS selector to await before screenshotting.
 * @param {number} settleMs - Extra delay after selector match (lets images paint).
 * @returns {Promise<Buffer>} PNG buffer ready for Discord attachment.
 * @throws {Error} On any Puppeteer failure (page is always closed first).
 */
async function generateImageFromTemplate(
  templateName,
  replacements,
  waitSelector,
  settleMs,
) {
  const startedAt = Date.now();
  let page;
  try {
    const templatePath = path.join(__dirname, "..", "templates", templateName);
    sysLog("debug", "imageGenerator:render start", {
      template: templateName,
      waitSelector,
    });
    let htmlContent = await fs.readFile(templatePath, "utf8");

    for (const [key, value] of Object.entries(replacements)) {
      htmlContent = htmlContent.replace(new RegExp(key, "g"), value);
    }

    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    await page.setDefaultNavigationTimeout(PUPPETEER_PAGE_TIMEOUT_MS);
    await page.setDefaultTimeout(PUPPETEER_PAGE_TIMEOUT_MS);
    await page.setViewport({ width: 1280, height: 720 });

    const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    await page.goto(dataUri, {
      waitUntil: "networkidle0",
      timeout: PUPPETEER_GOTO_TIMEOUT_MS,
    });

    if (waitSelector) {
      await page
        .waitForSelector(waitSelector, {
          timeout: PUPPETEER_SELECTOR_TIMEOUT_MS,
        })
        .catch(() => {
          sysLog("warn", "imageGenerator:waitForSelector timeout", {
            template: templateName,
            waitSelector,
          });
        });
    }
    await new Promise((r) => setTimeout(r, settleMs));

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
      timeout: PUPPETEER_SCREENSHOT_TIMEOUT_MS,
    });
    await page.close();
    sysLog("info", "imageGenerator:render ok", {
      template: templateName,
      durationMs: Date.now() - startedAt,
      bytes: screenshot.length,
    });
    return screenshot;
  } catch (error) {
    sysLog("error", "imageGenerator:render failed", {
      template: templateName,
      err: error.message,
      stack: error.stack,
    });
    if (page) await page.close().catch(() => {});
    throw error;
  }
}

/**
 * Render the live-stream banner shown alongside Discord announcement embeds.
 *
 * @async
 * @param {BannerData} streamData
 * @returns {Promise<Buffer>} PNG buffer.
 */
async function generateStreamBanner(streamData) {
  const vars = getCommonTemplateVars(streamData.provider);
  let filteredTitle = (streamData.title || "No title")
    .replace(/!\w+\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  vars["{{STREAM_TITLE}}"] = escapeHtml(filteredTitle);
  vars["{{STREAM_CATEGORY}}"] = escapeHtml(
    streamData.category || "No category",
  );
  vars["{{GAME_IMAGE_URL}}"] = escapeHtml(streamData.image || "");

  return generateImageFromTemplate(
    "streamBanner.html",
    vars,
    "#gameImage",
    BANNER_SETTLE_MS,
  );
}

/**
 * Render the "next streams this week" follow-up image shown when a stream ends
 * but the streamer has more sessions scheduled.
 *
 * @async
 * @param {{ provider: ("twitch"|"youtube") }} streamData - Provider drives the colour palette.
 * @param {ScheduleSegment[]} streamsJson - Upcoming segments to display.
 * @returns {Promise<Buffer>} PNG buffer.
 */
async function generateFollowupImage(streamData, streamsJson) {
  const vars = getCommonTemplateVars(streamData.provider);
  vars["{{STREAMS_JSON}}"] = JSON.stringify(streamsJson || []);

  return generateImageFromTemplate(
    "streamFollowup.html",
    vars,
    "#streamsContainer",
    NEXT_STREAMS_SETTLE_MS,
  );
}

/**
 * Render the generic "stream ended" image shown when no follow-up schedule
 * is available.
 *
 * @async
 * @param {{ provider: ("twitch"|"youtube") }} streamData
 * @returns {Promise<Buffer>} PNG buffer.
 */
async function generateEndedImage(streamData) {
  const vars = getCommonTemplateVars(streamData.provider);
  return generateImageFromTemplate(
    "streamEnded.html",
    vars,
    null,
    BANNER_SETTLE_MS,
  );
}

/**
 * Tear down the shared Puppeteer browser. Called from the graceful-shutdown
 * path in {@link module:clientManager.shutdown}.
 *
 * @async
 * @returns {Promise<void>}
 */
async function closeBrowser() {
  if (browser) {
    sysLog("info", "imageGenerator:closing browser");
    await browser.close();
    browser = null;
  }
}

module.exports = {
  generateStreamBanner,
  generateFollowupImage,
  generateEndedImage,
  closeBrowser,
};
