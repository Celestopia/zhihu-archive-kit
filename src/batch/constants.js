/**
 * Batch-mode constants shared by the Node server and browser batch client.
 */

export const DEFAULT_BATCH_PORT = 17891;
export const DEFAULT_OUTPUT_DIR = "output";
export const DEFAULT_DELAY_MIN_SECONDS = 15;
export const DEFAULT_DELAY_MAX_SECONDS = 45;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export const BATCH_HOST = "127.0.0.1";

export const JOB_STATUS = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  skipped: "skipped"
};
