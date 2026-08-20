/**
 * @module utils/discord/aiQueue
 * @description
 * Single-worker FIFO queue that serialises every AI call so we never issue
 * concurrent requests to Gemini, and enforces a global rolling-minute RPM cap
 * matching the free-tier limit. When the cap is hit the worker sleeps until
 * the oldest in-flight timestamp ages out — queued items are never dropped,
 * only delayed.
 *
 * Per-user cooldown is enforced *before* enqueueing, in `msgAI.js`. This
 * module is provider-agnostic and unaware of Discord users.
 */

import { discordLog } from "../core/loggers.js";
import {
  AI_GLOBAL_RPM_LIMIT,
  AI_GLOBAL_RPM_WINDOW_MS,
} from "../core/constants.js";

/**
 * Sliding window of dispatch timestamps (ms epoch) used to enforce the
 * `AI_GLOBAL_RPM_LIMIT` ceiling.
 * @type {number[]}
 */
const dispatchTimestamps = [];

/**
 * Pending tasks waiting for the worker. Each entry holds the run function
 * plus the resolve/reject callbacks of the promise returned to the caller.
 * @type {Array<{ run: () => Promise<*>, resolve: (v: *) => void, reject: (e: *) => void }>}
 */
const queue = [];

let workerRunning = false;

function purgeOldTimestamps(now) {
  while (
    dispatchTimestamps.length > 0 &&
    now - dispatchTimestamps[0] >= AI_GLOBAL_RPM_WINDOW_MS
  ) {
    dispatchTimestamps.shift();
  }
}

async function waitForGlobalSlot() {
  // Loop until a slot is available — typically just one iteration.
  while (true) {
    const now = Date.now();
    purgeOldTimestamps(now);

    if (dispatchTimestamps.length < AI_GLOBAL_RPM_LIMIT) {
      dispatchTimestamps.push(now);
      return;
    }

    // +50 ms slack so we don't wake up exactly on the boundary.
    const waitMs = AI_GLOBAL_RPM_WINDOW_MS - (now - dispatchTimestamps[0]) + 50;

    discordLog("info", "aiQueue:global rpm hit, waiting", {
      waitMs,
      queueLength: queue.length,
      windowCount: dispatchTimestamps.length,
    });

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

async function runWorker() {
  if (workerRunning) return;
  workerRunning = true;

  try {
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        await waitForGlobalSlot();
        const result = await item.run();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }
    }
  } finally {
    workerRunning = false;
  }
}

/**
 * Enqueue an AI task. Returns a promise that resolves with the task's value
 * once the worker reaches it and a global RPM slot is available.
 *
 * @template T
 * @param {() => Promise<T>} run - Async function performing the AI call.
 * @returns {Promise<T>}
 */
export function enqueue(run) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject });
    discordLog("debug", "aiQueue:enqueued", {
      queueLength: queue.length,
      windowCount: dispatchTimestamps.length,
    });
    // Fire-and-forget — the worker is idempotent.
    runWorker();
  });
}

/**
 * Snapshot of the current backlog size (for logging / metrics).
 * @returns {number}
 */
export function getQueueLength() {
  return queue.length;
}
