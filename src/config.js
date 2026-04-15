'use strict';

const path = require('path');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PLAYERS_RAW         = process.env.PLAYERS || '';
const TEST_MODE           = process.env.TEST_MODE === 'true';
const STATE_FILE          = path.join(__dirname, '..', 'state.json');
const GIPHY_API_KEY       = process.env.GIPHY_API_KEY;
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY;

const PLAYER_IDS = PLAYERS_RAW.split(',').map(s => s.trim()).filter(Boolean);

const DEFAULT_DISCORD_MAP = {
  '367812559': '1007384199235379220',
  '401560620': '747060591356543036',
  '374195236': '690180059184889917',
  '324679349': '925815702781308938',
  '495360748': '407859022520123393',
  '451891350': '1318047695696302091',
  '174903935': '1451621869269553154',
};

const TEST_DISCORD_MAP = { '451891350': '1318047695696302091' };

let DISCORD_USER_MAP = TEST_MODE ? TEST_DISCORD_MAP : DEFAULT_DISCORD_MAP;
try {
  if (process.env.DISCORD_USER_MAP) DISCORD_USER_MAP = JSON.parse(process.env.DISCORD_USER_MAP);
} catch {
  console.warn('Warning: DISCORD_USER_MAP is not valid JSON — using defaults.');
}

const PLAYER_ALIASES = {
  '401560620': 'Boog Bautista',
  '374195236': 'Devil Hans',
  '495360748': 'Maulakas',
};

const DEVIL_HANS_ACCOUNT = '374195236';
const DEVIL_HANS_DISCORD = '690180059184889917';

const GAME_MODES = {
  0: 'Unknown',      1: 'All Pick',         2: "Captain's Mode",  3: 'Random Draft',
  4: 'Single Draft', 5: 'All Random',       11: 'Mid Only',       16: "Captain's Draft",
  18: 'Ability Draft', 20: 'ARDM',          21: '1v1 Solo Mid',   22: 'All Pick (Ranked)',
  23: 'Turbo',       24: 'Mutation',
};

const DOTA_LOGO = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png';

module.exports = {
  DISCORD_WEBHOOK_URL,
  PLAYER_IDS,
  TEST_MODE,
  STATE_FILE,
  GIPHY_API_KEY,
  GEMINI_API_KEY,
  DISCORD_USER_MAP,
  PLAYER_ALIASES,
  DEVIL_HANS_ACCOUNT,
  DEVIL_HANS_DISCORD,
  GAME_MODES,
  DOTA_LOGO,
};
