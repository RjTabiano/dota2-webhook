'use strict';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function kdaEmoji(kda) {
  if (kda >= 5) return '🔥';
  if (kda >= 3) return '⚡';
  if (kda >= 2) return '👍';
  if (kda >= 1) return '😐';
  return '💩';
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`  Retry ${attempt}/${retries - 1} after error: ${err.message}`);
      await sleep(delayMs);
    }
  }
}

function isWin(match) {
  return match.player_slot < 128 ? match.radiant_win : !match.radiant_win;
}

module.exports = { sleep, pickRandom, kdaEmoji, formatDuration, withRetry, isWin };
