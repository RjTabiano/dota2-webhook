'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PLAYERS_RAW         = process.env.PLAYERS || '';
const TEST_MODE           = process.env.TEST_MODE === 'true';
const STATE_FILE          = path.join(__dirname, 'state.json');
const GIPHY_API_KEY       = process.env.GIPHY_API_KEY;

const PLAYER_IDS = PLAYERS_RAW.split(',').map(s => s.trim()).filter(Boolean);

let DISCORD_USER_MAP = {};
try {
  if (process.env.DISCORD_USER_MAP) DISCORD_USER_MAP = JSON.parse(process.env.DISCORD_USER_MAP);
} catch {
  console.warn('Warning: DISCORD_USER_MAP is not valid JSON — mentions disabled.');
}

// ---------------------------------------------------------------------------
// Game mode names
// ---------------------------------------------------------------------------

const GAME_MODES = {
  0: 'Unknown', 1: 'All Pick', 2: "Captain's Mode", 3: 'Random Draft',
  4: 'Single Draft', 5: 'All Random', 11: 'Mid Only', 16: "Captain's Draft",
  18: 'Ability Draft', 20: 'ARDM', 21: '1v1 Solo Mid', 22: 'All Pick (Ranked)',
  23: 'Turbo', 24: 'Mutation',
};

// ---------------------------------------------------------------------------
// Hero data
// ---------------------------------------------------------------------------

const heroData = {};

async function fetchHeroNames() {
  try {
    const res = await fetch('https://api.opendota.com/api/heroes');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    for (const h of list) {
      heroData[h.id] = {
        name: h.localized_name,
        slug: h.name.replace('npc_dota_hero_', ''),
      };
    }
    console.log(`Loaded ${Object.keys(heroData).length} heroes.`);
  } catch (err) {
    console.warn('Could not load hero names:', err.message);
  }
}

function heroName(id)     { return heroData[id]?.name || `Hero #${id}`; }
function heroImageUrl(id) {
  const slug = heroData[id]?.slug;
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

// ---------------------------------------------------------------------------
// Performance engine
// ---------------------------------------------------------------------------

function evaluate(kills, deaths, assists, won) {
  const kda = (kills + assists) / Math.max(deaths, 1);

  if (won) {
    if (kda >= 5 || (kills >= 15 && deaths <= 3)) {
      return {
        tier: 'godlike', label: 'GODLIKE', emoji: '🔥', color: 0xFFD700,
        title: '🏆 VICTORY — Absolute Domination',
        comments: [
          'Built different. Enemies are uninstalling. 🔥',
          'RAMPAGE energy. GG no re. 👑',
          'Cooked them alive. Certified carry. 🍳',
          'Bro said "I\'ll do it myself" and did. 💪',
          'The enemy is now in therapy. Respect. 🏆',
        ],
      };
    }
    if (kda >= 2.5) {
      return {
        tier: 'good', label: 'SOLID', emoji: '💪', color: 0x2ECC71,
        title: '🏆 VICTORY — Clean Game',
        comments: [
          'Carried responsibly. MMR up. 📈',
          'That\'s how it\'s done. GG EZ.',
          'No notes. Solid from start to finish.',
          'Consistent. Reliable. Actually scary.',
        ],
      };
    }
    if (kda >= 1.5) {
      return {
        tier: 'average', label: 'DECENT', emoji: '👍', color: 0x27AE60,
        title: '🏆 VICTORY — Scraped Through',
        comments: [
          'A win is a win. Take it and walk. 🤷',
          'Ugly but effective. We take those.',
          'Not your best but the scoreboard says W.',
          'Could\'ve been cleaner but hey, green is green.',
        ],
      };
    }
    return {
      tier: 'boosted', label: 'BOOSTED', emoji: '🍀', color: 0x1ABC9C,
      title: '🏆 VICTORY — Lucky Escape',
      comments: [
        'Teammates carried you. Buy them a drink. 🍺',
        'How did you even win playing like that? 😭',
        'The matchmaking gods smiled on you today. 🙏',
        'Lucky win. Don\'t make it a habit. 😬',
        'Your team deserves the credit. Not you. 💀',
      ],
    };
  }

  if (kills >= 20) {
    return {
      tier: 'unlucky', label: 'UNLUCKY', emoji: '😔', color: 0x95A5A6,
      title: '💀 DEFEAT — Actually Tried',
      comments: [
        `${kills} kills and still lost?? Your team is genuinely cooked. 🍳`,
        'OK fine, you showed up. Your teammates did not. 💔',
        `${kills} kills. Carried 4 corpses. Still an L. Tragic. 😭`,
        'Genuinely a 1v9. You are not the problem. For once. 🫡',
      ],
    };
  }
  if (deaths >= 12 || kda < 0.5) {
    return {
      tier: 'int', label: 'INTING', emoji: '🪦', color: 0xE74C3C,
      title: '💀 DEFEAT — Certified Thrower',
      comments: [
        'Trash, bro throwing 🗑️',
        'Certified int machine. 0 game sense detected. 🤖',
        'Bro fed more than a food truck. 🌮💀',
        'Who gave this man internet access? 💀',
        'Delete Dota. Respectfully. Permanently. 🗑️',
        'The enemy carry personally thanks you. 🫡',
        'Bro was playing for the other team the whole time. 😭',
        'Actual negative impact. The team was better 4v5. 🤡',
      ],
    };
  }
  if (deaths >= 7 || kda < 1) {
    return {
      tier: 'bad', label: 'FEEDING', emoji: '😬', color: 0xE67E22,
      title: '💀 DEFEAT — Skill Issue',
      comments: [
        'Bro played like it\'s his first game. 🤡',
        'Skill issue detected. Very clearly. 🔍',
        'Negative impact player. Classic behaviour.',
        'That was rough to watch. Everyone in the lobby felt that. 👀',
        'Even the courier had better positioning. Embarrassing.',
        'This is why your MMR looks like that. 📉',
        'Reported for griefing. By your own team. 🚨',
      ],
    };
  }
  if (kda >= 3) {
    return {
      tier: 'bad', label: 'STATS PLAYER', emoji: '📦', color: 0xE67E22,
      title: '💀 DEFEAT — KDA Merchant',
      comments: [
        'Good KDA. Still lost. You\'re the problem. 📦',
        'Stats player detected. Zero impact. 🗿',
        'Pretty numbers. Ugly result. Explain yourself. 🤡',
        'Bro was farming stats while the base burned. 🔥',
        'KDA doesn\'t win games bro. Objectives do. 📉',
        'High KDA = you were avoiding fights. Coward arc. 😤',
      ],
    };
  }
  return {
    tier: 'average', label: 'INTER', emoji: '😤', color: 0xC0392B,
    title: '💀 DEFEAT — Mid at Best',
    comments: [
      'Mid at best. And that\'s generous. 😤',
      'Contribution: minimal. Result: terrible. 💔',
      'You were there. Barely. 🪑',
      'Not the worst. Just close to it.',
      'Replacement level player behaviour. 📋',
      'Bro was AFK mentally the whole game. 🧠❌',
    ],
  };
}

// ---------------------------------------------------------------------------
// Party & streak comments
// ---------------------------------------------------------------------------

const PARTY_WIN_COMMENTS = [
  'Luck? Probably. Skill? Highly debatable. 🍀',
  'Once in a blue moon, these guys actually win together. 🌙',
  'The stars aligned. Don\'t expect this again. ⭐',
  'Even a broken clock is right twice a day. 🕐',
  'This win will be told to their grandchildren. Because it barely happens. 😭',
  'A party win! Miracles do exist. 🙏',
  'Somehow, someway, they pulled it off. Nobody is more surprised than them. 😲',
  'Scientists are baffled. How did this happen? 🔬',
];

const PARTY_LOSS_COMMENTS = [
  'They queued together just to lose together. Friendship goals. 💀',
  'A coordinated defeat. Impressive in its own way. 🤝',
  'They practiced losing as a team. It shows. 🗑️',
  'Five heads, zero game sense. Classic party queue. 🤡',
  'The group chat is silent right now. 😶',
  'They came. They saw. They threw. Together. 💔',
  'Proof that communication doesn\'t always help. 🗣️❌',
];

// Bad stats on a WIN: deaths > kills by 10
const BAD_WIN_ROASTS = [
  'Won but how are you dying that much?? You\'re embarrassing the team. 🤡',
  'This is a W on paper. Personally it\'s a failure. 💀',
  'The enemy carry got fed by YOU and you STILL won. Chaotic. 🌀',
  'Teammates carried this corpse to victory. Respect to them. 🫡',
  'You died more than you killed. In a winning game. Impressive. 🗑️',
];

function getStreakComment(streak, names) {
  const who = names.length > 1 ? 'These grandpas' : `${names[0]} the grandpa`;
  if (streak >= 5) return `${streak} WIN STREAK 👴💀 ${who} refuse to log off. Someone unplug their router.`;
  if (streak >= 4) return `${streak} wins in a row 👴🔥 ${who} are in their villain arc. Be scared.`;
  if (streak >= 3) return `${streak} streak! 👴 Old man strength is REAL. ${who} are NOT slowing down.`;
  return `${streak} wins in a row. The grandpas are active today 👴 Probably won't last but here we are.`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function kdaEmoji(kills, deaths, assists) {
  const kda = (kills + assists) / Math.max(deaths, 1);
  if (kda >= 5) return '🔥';
  if (kda >= 3) return '⚡';
  if (kda >= 2) return '👍';
  if (kda >= 1) return '😐';
  return '💩';
}

function deathsLabel(deaths) {
  if (deaths >= 15) return `${deaths}  🪦🪦🪦`;
  if (deaths >= 10) return `${deaths}  🪦🪦`;
  if (deaths >= 7)  return `${deaths}  🪦`;
  return `${deaths}`;
}

function perfBadge(perf) {
  const squares = { godlike: '🥇', good: '🟢', average: '🟡', boosted: '🍀', int: '🟥', bad: '🟠', unlucky: '🔵' };
  return `${squares[perf.tier] || '⬜'}  \`  ${perf.label}  \``;
}

const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

// ---------------------------------------------------------------------------
// Giphy + Imgflip
// ---------------------------------------------------------------------------

const GIPHY_QUERIES = {
  godlike: 'gaming domination win', good: 'gg easy win gaming',
  average: 'barely made it gaming', boosted: 'lucky win gaming',
  int: 'this is fine fire meme',    bad: 'skill issue gaming fail',
  unlucky: 'useless teammates meme', party: 'squad win celebration',
};

async function fetchGif(tier) {
  if (!GIPHY_API_KEY) return null;
  try {
    const q   = encodeURIComponent(GIPHY_QUERIES[tier] || 'gaming');
    const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${q}&limit=10&rating=pg-13`);
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data?.length) return null;
    const gif = data[Math.floor(Math.random() * data.length)];
    return gif.images?.downsized?.url || gif.images?.original?.url || null;
  } catch { return null; }
}

async function fetchMeme() {
  try {
    const res = await fetch('https://api.imgflip.com/get_memes');
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data?.memes?.length) return null;
    return data.memes[Math.floor(Math.random() * data.memes.length)].url || null;
  } catch { return null; }
}

async function fetchMedia(tier) {
  return Math.random() < 0.5 ? fetchGif(tier) : fetchMeme();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) { console.warn('Could not load state.json — starting fresh.', err.message); }
  return { last_match_ids: {}, win_streaks: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

function isWin(match) {
  return match.player_slot < 128 ? match.radiant_win : !match.radiant_win;
}

// ---------------------------------------------------------------------------
// OpenDota
// ---------------------------------------------------------------------------

async function fetchRecentMatches(accountId) {
  const res = await fetch(`https://api.opendota.com/api/players/${accountId}/recentMatches`);
  if (!res.ok) throw new Error(`OpenDota ${res.status} for player ${accountId}`);
  return res.json();
}

async function fetchPlayerProfile(accountId) {
  try {
    const res  = await fetch(`https://api.opendota.com/api/players/${accountId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name:   data.profile?.personaname || `Player ${accountId}`,
      avatar: data.profile?.avatarfull  || null,
      url:    `https://www.opendota.com/players/${accountId}`,
    };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Solo embed builder
// ---------------------------------------------------------------------------

function buildEmbed(match, accountId, profile, gifUrl = null, streak = 0) {
  const won      = isWin(match);
  const { kills, deaths, assists, duration, game_mode, match_id, start_time, hero_id } = match;
  const perf     = evaluate(kills, deaths, assists, won);
  const matchUrl = `https://www.opendota.com/matches/${match_id}`;
  const discId   = DISCORD_USER_MAP[String(accountId)];
  const mention  = discId ? `<@${discId}> ` : '';
  const mins     = Math.floor(duration / 60);
  const secs     = duration % 60;
  const mode     = GAME_MODES[game_mode] || `Mode ${game_mode}`;
  const imgUrl   = heroImageUrl(hero_id);
  const kdaRatio = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);

  // Extra roast if won but deaths >> kills
  const isBadWin = won && deaths > kills + 10;
  const comment  = isBadWin ? pickRandom(BAD_WIN_ROASTS) : pickRandom(perf.comments);

  // Streak line appended to description if on a run
  const streakLine = streak >= 2
    ? `\n🔥 **${getStreakComment(streak, [profile?.name || `Player ${accountId}`])}**`
    : '';

  const authorName = profile ? `${mention}${profile.name}` : `${mention}Player ${accountId}`;

  const embed = {
    author: {
      name:     authorName,
      icon_url: profile?.avatar || undefined,
      url:      profile?.url    || `https://www.opendota.com/players/${accountId}`,
    },
    title: perf.title,
    description: [
      perfBadge(perf),
      '',
      `${perf.emoji}  *${comment}*`,
      streakLine,
      SEP,
    ].join('\n'),
    color: perf.color,
    url:   matchUrl,
    thumbnail: imgUrl ? { url: imgUrl } : undefined,
    image:     gifUrl ? { url: gifUrl } : undefined,
    fields: [
      { name: '⚔️  Kills',   value: `**${kills}**`,                                     inline: true },
      { name: '💀  Deaths',  value: `**${deathsLabel(deaths)}**`,                        inline: true },
      { name: '🤝  Assists', value: `**${assists}**`,                                    inline: true },
      { name: '\u200b', value: '\u200b', inline: false },
      { name: `📊  KDA ${kdaEmoji(kills, deaths, assists)}`, value: `**${kdaRatio}**`,   inline: true },
      { name: '⏱️  Duration', value: `**${mins}m ${String(secs).padStart(2, '0')}s**`,  inline: true },
      { name: '🎮  Mode',    value: `**${mode}**`,                                       inline: true },
      { name: '\u200b', value: '\u200b', inline: false },
      { name: '🦸  Hero',   value: `**${heroName(hero_id)}**`,                           inline: true },
      { name: '🆔  Match',  value: `**[${match_id}](${matchUrl})**`,                    inline: true },
    ],
    footer:    { text: `Dota 2 Tracker  •  Player ${accountId}`, icon_url: profile?.avatar || undefined },
    timestamp: new Date(start_time * 1000).toISOString(),
  };

  if (!imgUrl) delete embed.thumbnail;
  return embed;
}

// ---------------------------------------------------------------------------
// Party embed builder
// ---------------------------------------------------------------------------

function buildPartyEmbed(players, gifUrl = null) {
  // players: [{ accountId, match, profile }]
  const first    = players[0].match;
  const won      = isWin(first);
  const matchUrl = `https://www.opendota.com/matches/${first.match_id}`;
  const mins     = Math.floor(first.duration / 60);
  const secs     = first.duration % 60;
  const mode     = GAME_MODES[first.game_mode] || `Mode ${first.game_mode}`;

  const comment  = pickRandom(won ? PARTY_WIN_COMMENTS : PARTY_LOSS_COMMENTS);
  const title    = won ? '🏆 SQUAD WIN — Party Victory' : '💀 SQUAD LOSS — Party Diff';
  const color    = won ? 0xFFD700 : 0xE74C3C;
  const badge    = won ? '🟡  `  PARTY WIN  `' : '🟥  `  PARTY LOSS  `';

  // Check for streaks across party members
  const streakLines = players
    .filter(p => (p.streak || 0) >= 2)
    .map(p => `🔥 **${getStreakComment(p.streak, [p.profile?.name || `Player ${p.accountId}`])}**`);

  // Per-player stat rows
  const playerFields = players.map(p => {
    const { kills, deaths, assists, hero_id } = p.match;
    const kda      = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);
    const isBadWin = won && deaths > kills + 10;
    const roast    = isBadWin ? ' ← carried 🗑️' : '';
    const discId   = DISCORD_USER_MAP[String(p.accountId)];
    const name     = p.profile?.name || `Player ${p.accountId}`;
    const mention  = discId ? `<@${discId}>` : name;
    return {
      name:   `${mention}  —  🦸 ${heroName(hero_id)}`,
      value:  `⚔️ **${kills}** / 💀 **${deathsLabel(deaths)}** / 🤝 **${assists}**  ·  KDA **${kda}** ${kdaEmoji(kills, deaths, assists)}${roast}`,
      inline: false,
    };
  });

  const embed = {
    title,
    description: [
      badge,
      '',
      `🎉  *${comment}*`,
      ...(streakLines.length ? ['', ...streakLines] : []),
      SEP,
    ].join('\n'),
    color,
    url: matchUrl,
    image: gifUrl ? { url: gifUrl } : undefined,
    fields: [
      ...playerFields,
      { name: '\u200b', value: '\u200b', inline: false },
      { name: '⏱️  Duration', value: `**${mins}m ${String(secs).padStart(2, '0')}s**`, inline: true },
      { name: '🎮  Mode',     value: `**${mode}**`,                                    inline: true },
      { name: '🆔  Match',    value: `**[${first.match_id}](${matchUrl})**`,           inline: true },
    ],
    footer:    { text: `Dota 2 Tracker  •  Party Match` },
    timestamp: new Date(first.start_time * 1000).toISOString(),
  };

  return embed;
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

async function sendEmbed(embed) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Discord ${res.status}: ${text}`);
  }
  await sleep(300);
}

// ---------------------------------------------------------------------------
// Gather all new matches across all players, grouped by match+team
// ---------------------------------------------------------------------------

async function gatherAllMatches(state) {
  // Fetch all players' data in parallel
  const playerData = await Promise.all(
    PLAYER_IDS.map(async id => {
      try {
        const [matches, profile] = await Promise.all([
          fetchRecentMatches(id),
          fetchPlayerProfile(id),
        ]);
        return { accountId: id, matches: matches || [], profile };
      } catch (err) {
        console.error(`  Error fetching player ${id}:`, err.message);
        return { accountId: id, matches: [], profile: null };
      }
    })
  );

  // matchGroups: key = `${matchId}_${team}` → [{ accountId, match, profile }]
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

    // Advance state
    state.last_match_ids[String(accountId)] = newMatches[newMatches.length - 1].match_id;

    for (const match of newMatches) {
      const team = match.player_slot < 128 ? 'radiant' : 'dire';
      const key  = `${match.match_id}_${team}`;
      if (!matchGroups[key]) matchGroups[key] = [];
      matchGroups[key].push({ accountId, match, profile });
    }
  }

  if (firstRunIds.length) {
    console.log(`  First run baseline set for: ${firstRunIds.join(', ')}`);
  }

  return matchGroups;
}

// ---------------------------------------------------------------------------
// Process match groups — send embeds
// ---------------------------------------------------------------------------

async function processMatchGroups(matchGroups, state) {
  // Sort keys by match_id (oldest first)
  const keys = Object.keys(matchGroups).sort((a, b) => {
    const idA = parseInt(a.split('_')[0]);
    const idB = parseInt(b.split('_')[0]);
    return idA - idB;
  });

  for (const key of keys) {
    const group = matchGroups[key];
    const won   = isWin(group[0].match);

    if (group.length >= 2) {
      // ── PARTY MATCH ────────────────────────────────────────────────────────
      console.log(`  Party match ${group[0].match.match_id} (${group.map(p => p.accountId).join(', ')}): ${won ? 'WIN' : 'LOSS'}`);

      // Attach streaks to each party member
      for (const p of group) {
        if (won) {
          state.win_streaks[String(p.accountId)] = (state.win_streaks[String(p.accountId)] || 0) + 1;
        } else {
          state.win_streaks[String(p.accountId)] = 0;
        }
        p.streak = state.win_streaks[String(p.accountId)];
      }

      const gifUrl = await fetchMedia('party');
      await sendEmbed(buildPartyEmbed(group, gifUrl));

    } else {
      // ── SOLO MATCH ─────────────────────────────────────────────────────────
      const { accountId, match, profile } = group[0];
      console.log(`  Solo match ${match.match_id} (${accountId}): ${won ? 'WIN' : 'LOSS'}`);

      if (won) {
        state.win_streaks[String(accountId)] = (state.win_streaks[String(accountId)] || 0) + 1;
      } else {
        state.win_streaks[String(accountId)] = 0;
      }
      const streak = state.win_streaks[String(accountId)];

      if (won) {
        const perf   = evaluate(match.kills, match.deaths, match.assists, true);
        const gifUrl = await fetchMedia(perf.tier);
        await sendEmbed(buildEmbed(match, accountId, profile, gifUrl, streak));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!DISCORD_WEBHOOK_URL) { console.error('Fatal: DISCORD_WEBHOOK_URL not set.'); process.exit(1); }
  if (!PLAYER_IDS.length)   { console.error('Fatal: PLAYERS not set.');             process.exit(1); }

  console.log(`Mode    : ${TEST_MODE ? 'TEST' : 'NORMAL'}`);
  console.log(`Players : ${PLAYER_IDS.join(', ')}`);

  await fetchHeroNames();
  const state = loadState();
  if (!state.win_streaks) state.win_streaks = {};

  // ── TEST MODE ──────────────────────────────────────────────────────────────
  if (TEST_MODE) {
    for (const accountId of PLAYER_IDS) {
      try {
        const [matches, profile] = await Promise.all([
          fetchRecentMatches(accountId),
          fetchPlayerProfile(accountId),
        ]);
        if (!matches?.length) continue;
        const latest = matches[0];
        const perf   = evaluate(latest.kills, latest.deaths, latest.assists, isWin(latest));
        const gifUrl = await fetchMedia(perf.tier);
        console.log(`  Test: ${accountId} (${profile?.name}) — match ${latest.match_id}`);
        await sendEmbed(buildEmbed(latest, accountId, profile, gifUrl, 0));
      } catch (err) {
        console.error(`  Error for ${accountId}:`, err.message);
      }
    }
    console.log('\nTest done. state.json unchanged.');
    return;
  }

  // ── NORMAL MODE ───────────────────────────────────────────────────────────
  const matchGroups = await gatherAllMatches(state);
  await processMatchGroups(matchGroups, state);

  saveState(state);
  console.log('\nState saved.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
