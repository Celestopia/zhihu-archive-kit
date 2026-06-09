/**
 * Time helpers used by batch scheduling and the browser batch client.
 */

export function randomDelaySeconds(minSeconds, maxSeconds) {
  const min = Math.max(0, Number(minSeconds) || 0);
  const max = Math.max(min, Number(maxSeconds) || min);
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function formatIsoNow() {
  return new Date().toISOString();
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

