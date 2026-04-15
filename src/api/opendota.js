'use strict';

const { withRetry }      = require('../utils');
const { PLAYER_ALIASES } = require('../config');

async function fetchRecentMatches(accountId) {
  const res = await fetch(`https://api.opendota.com/api/players/${accountId}/recentMatches`);
  if (!res.ok) throw new Error(`OpenDota ${res.status} for player ${accountId}`);
  return res.json();
}

const matchDetailCache = {};

async function fetchMatchItems(matchId, accountId) {
  if (!matchDetailCache[matchId]) {
    try {
      await withRetry(async () => {
        const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        matchDetailCache[matchId] = await res.json();
      });
    } catch { matchDetailCache[matchId] = null; }
  }
  const detail = matchDetailCache[matchId];
  if (!detail?.players) return [];
  const player = detail.players.find(p => String(p.account_id) === String(accountId));
  if (!player) return [];
  return [player.item_0, player.item_1, player.item_2,
          player.item_3, player.item_4, player.item_5]
    .filter(id => id && id !== 0);
}

async function fetchPlayerProfile(accountId) {
  try {
    return await withRetry(async () => {
      const res  = await fetch(`https://api.opendota.com/api/players/${accountId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        name:   data.profile?.personaname || PLAYER_ALIASES[String(accountId)] || `Player ${accountId}`,
        avatar: data.profile?.avatarfull  || null,
        url:    `https://www.opendota.com/players/${accountId}`,
      };
    });
  } catch { return null; }
}

module.exports = { fetchRecentMatches, fetchMatchItems, fetchPlayerProfile };
