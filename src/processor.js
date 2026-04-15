'use strict';

const { PLAYER_IDS, TEST_MODE, DISCORD_WEBHOOK_URL, PLAYER_ALIASES } = require('./config');
const { isWin }                                       = require('./utils');
const { loadState, saveState }                        = require('./state');
const { fetchHeroNames, fetchItemNames, heroName }    = require('./game/heroes');
const { evaluate }                                    = require('./game/performance');
const { fetchRecentMatches, fetchMatchItems,
        fetchPlayerProfile }                          = require('./api/opendota');
const { sendEmbed, sendEmbedWithThumb }               = require('./api/discord');
const { fetchMedia, fetchOneMoreDayGif,
        fetchSadWolfGif }                             = require('./api/media');
const { buildEmbed }                                  = require('./embeds/solo');
const { buildPartyEmbed }                             = require('./embeds/party');
const { generateHeroWithItems }                       = require('./embeds/canvas');
const { generateSolo, generateParty }                 = require('./api/gemini');

// Centralised GIF selector — DRY: used by both solo and party paths
async function selectGif(lossStreak, rawGif) {
  if (lossStreak >= 5)                         return (await fetchOneMoreDayGif()) || rawGif;
  if (lossStreak === 2 && Math.random() < 0.5) return (await fetchSadWolfGif())    || rawGif;
  return rawGif;
}

function updateStreaks(state, accountId, won) {
  const id = String(accountId);
  if (won) {
    state.win_streaks[id]  = (state.win_streaks[id]  || 0) + 1;
    state.loss_streaks[id] = 0;
  } else {
    state.loss_streaks[id] = (state.loss_streaks[id] || 0) + 1;
    state.win_streaks[id]  = 0;
  }
  return { streak: state.win_streaks[id], lossStreak: state.loss_streaks[id] };
}

function resolvePlayerName(accountId, profile) {
  return PLAYER_ALIASES[String(accountId)] || profile?.name || `Player ${accountId}`;
}

// Core send logic — shared by normal mode and test mode
async function dispatchSolo(match, accountId, profile, streak, lossStreak) {
  const won        = isWin(match);
  const perf       = evaluate(match.kills, match.deaths, match.assists, won);
  const playerName = resolvePlayerName(accountId, profile);
  const { kills, deaths, assists, hero_id } = match;

  const [rawGif, items, ai] = await Promise.all([
    fetchMedia(perf.tier),
    fetchMatchItems(match.match_id, accountId),
    generateSolo({ playerName, heroName: heroName(hero_id), kills, deaths, assists, won, tier: perf.label, streak, lossStreak }),
  ]);

  const gifUrl          = await selectGif(lossStreak, rawGif);
  const everyoneContent = lossStreak >= 3 ? '@everyone' : '';
  const embed           = buildEmbed(match, accountId, profile, gifUrl, streak, lossStreak, ai.comment, ai.cause, ai.streakComment);

  if (items.length) {
    await sendEmbedWithThumb(embed, await generateHeroWithItems(match.hero_id, items), everyoneContent);
  } else {
    await sendEmbed(embed, everyoneContent);
  }
}

async function dispatchParty(group) {
  const won         = isWin(group[0].match);
  const pName       = p => resolvePlayerName(p.accountId, p.profile);
  const maxWin      = Math.max(...group.map(p => p.streak     || 0));
  const maxLoss     = Math.max(...group.map(p => p.lossStreak || 0));
  const streakNames = maxWin >= 2
    ? group.filter(p => (p.streak     || 0) === maxWin).map(pName)
    : group.filter(p => (p.lossStreak || 0) === maxLoss).map(pName);

  const partyPlayers = group.map(p => ({
    name: pName(p), kills: p.match.kills, deaths: p.match.deaths, assists: p.match.assists,
  }));

  const [rawGif, ai] = await Promise.all([
    fetchMedia('party'),
    generateParty({ won, players: partyPlayers, maxWin, maxLoss, streakNames }),
  ]);

  const gifUrl = await selectGif(maxLoss, rawGif);
  await sendEmbed(buildPartyEmbed(group, gifUrl, ai.comment, ai.streakComment));
}

async function sendSolo(match, accountId, profile, state) {
  const won                    = isWin(match);
  const { streak, lossStreak } = updateStreaks(state, accountId, won);
  await dispatchSolo(match, accountId, profile, streak, lossStreak);
}

async function sendParty(group, state) {
  const won = isWin(group[0].match);
  for (const p of group) {
    const s  = updateStreaks(state, p.accountId, won);
    p.streak     = s.streak;
    p.lossStreak = s.lossStreak;
  }
  await dispatchParty(group);
}

async function gatherAllMatches(state) {
  const playerData = await Promise.all(
    PLAYER_IDS.map(async id => {
      try {
        const [matches, profile] = await Promise.all([fetchRecentMatches(id), fetchPlayerProfile(id)]);
        return { accountId: id, matches: matches || [], profile };
      } catch (err) {
        console.error(`  Error fetching player ${id}:`, err.message);
        return { accountId: id, matches: [], profile: null };
      }
    })
  );

  const matchGroups = {};
  const firstRunIds = [];

  for (const { accountId, matches, profile } of playerData) {
    if (profile) console.log(`  ${accountId}: ${profile.name}`);
    if (!matches.length) { console.log(`  ${accountId}: no recent matches`); continue; }

    const lastId = state.last_match_ids[String(accountId)];
    if (lastId === undefined) {
      state.last_match_ids[String(accountId)] = matches[0].match_id;
      firstRunIds.push(accountId);
      continue;
    }

    const newMatches = matches
      .filter(m => m.match_id > lastId)
      .sort((a, b) => a.match_id - b.match_id);

    if (!newMatches.length) { console.log(`  ${accountId}: no new matches`); continue; }

    state.last_match_ids[String(accountId)] = newMatches[newMatches.length - 1].match_id;

    for (const match of newMatches) {
      const team = match.player_slot < 128 ? 'radiant' : 'dire';
      const key  = `${match.match_id}_${team}`;
      if (!matchGroups[key]) matchGroups[key] = [];
      matchGroups[key].push({ accountId, match, profile });
    }
  }

  if (firstRunIds.length) console.log(`  First run baseline set for: ${firstRunIds.join(', ')}`);
  return matchGroups;
}

async function processMatchGroups(matchGroups, state) {
  const keys = Object.keys(matchGroups).sort((a, b) => parseInt(a) - parseInt(b));
  for (const key of keys) {
    const group = matchGroups[key];
    const won   = isWin(group[0].match);
    if (group.length >= 2) {
      console.log(`  Party match ${group[0].match.match_id} (${group.map(p => p.accountId).join(', ')}): ${won ? 'WIN' : 'LOSS'}`);
      await sendParty(group, state);
    } else {
      const { accountId, match, profile } = group[0];
      console.log(`  Solo match ${match.match_id} (${accountId}): ${won ? 'WIN' : 'LOSS'}`);
      await sendSolo(match, accountId, profile, state);
    }
  }
}

async function processTestMode(state) {
  const testPlayers = (await Promise.all(
    PLAYER_IDS.map(async accountId => {
      try {
        const [matches, profile] = await Promise.all([fetchRecentMatches(accountId), fetchPlayerProfile(accountId)]);
        if (!matches?.length) return null;
        return { accountId, match: matches[0], profile };
      } catch (err) {
        console.error(`  Error fetching ${accountId}:`, err.message);
        return null;
      }
    })
  )).filter(Boolean);

  const testGroups = {};
  for (const p of testPlayers) {
    const team = p.match.player_slot < 128 ? 'radiant' : 'dire';
    const key  = `${p.match.match_id}_${team}`;
    if (!testGroups[key]) testGroups[key] = [];
    testGroups[key].push(p);
  }

  for (const group of Object.values(testGroups)) {
    for (const p of group) {
      p.streak     = state.win_streaks[String(p.accountId)]  || 0;
      p.lossStreak = state.loss_streaks[String(p.accountId)] || 0;
    }
    if (group.length >= 2) {
      console.log(`  Test party: ${group.map(p => p.accountId).join(', ')} — match ${group[0].match.match_id}`);
      await dispatchParty(group);
    } else {
      const { accountId, match, profile } = group[0];
      const { streak, lossStreak }        = group[0];
      console.log(`  Test solo: ${accountId} (${profile?.name}) — match ${match.match_id}, streak: W${streak}/L${lossStreak}`);
      await dispatchSolo(match, accountId, profile, streak, lossStreak);
    }
  }

  console.log('\nTest done. state.json unchanged.');
}

async function main() {
  if (!DISCORD_WEBHOOK_URL) { console.error('Fatal: DISCORD_WEBHOOK_URL not set.'); process.exit(1); }
  if (!PLAYER_IDS.length)   { console.error('Fatal: PLAYERS not set.');             process.exit(1); }

  console.log(`Mode    : ${TEST_MODE ? 'TEST' : 'NORMAL'}`);
  console.log(`Players : ${PLAYER_IDS.join(', ')}`);

  await Promise.all([fetchHeroNames(), fetchItemNames()]);

  const state = loadState();
  state.win_streaks  ??= {};
  state.loss_streaks ??= {};

  if (TEST_MODE) {
    await processTestMode(state);
    return;
  }

  const matchGroups = await gatherAllMatches(state);
  await processMatchGroups(matchGroups, state);
  saveState(state);
  console.log('\nState saved.');
}

module.exports = { main };
