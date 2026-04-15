'use strict';

const fs             = require('fs');
const { STATE_FILE } = require('./config');

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.warn('Could not load state.json — starting fresh.', err.message);
  }
  return { last_match_ids: {}, win_streaks: {}, loss_streaks: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

module.exports = { loadState, saveState };
