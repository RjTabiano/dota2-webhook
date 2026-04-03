/**
 * Dota 2 Win Tracker — with announcer-style roast commentary
 *
 * Environment variables:
 *   DISCORD_WEBHOOK_URL  - Discord incoming webhook URL (required)
 *   PLAYERS              - Comma-separated OpenDota account IDs (required)
 *   DISCORD_USER_MAP     - Optional JSON: {"accountId": "discordUserId"} for mentions
 *   TEST_MODE            - "true" to send latest match regardless of result
 */

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
// Hero data  { id → { localized_name, slug } }
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
        // 'npc_dota_hero_shadow_fiend' → 'shadow_fiend'
        slug: h.name.replace('npc_dota_hero_', ''),
      };
    }
    console.log(`Loaded ${Object.keys(heroData).length} heroes.`);
  } catch (err) {
    console.warn('Could not load hero names:', err.message);
  }
}

function heroName(id)     { return heroData[id]?.name  || `Hero #${id}`; }
function heroImageUrl(id) {
  const slug = heroData[id]?.slug;
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

// ---------------------------------------------------------------------------
// Performance engine
// ---------------------------------------------------------------------------

/**
 * Returns { tier, label, emoji, color, title, comments[] }
 * Tiers (win):  'godlike' | 'good' | 'average' | 'boosted'
 * Tiers (loss): 'int' | 'bad' | 'unlucky' | 'average'
 *
 * Loss rule: always blame. Only positive if kills > 20.
 */
function evaluate(kills, deaths, assists, won) {
  const kda = (kills + assists) / Math.max(deaths, 1);

  // ── WIN ───────────────────────────────────────────────────────────────────
  if (won) {
    if (kda >= 5 || (kills >= 15 && deaths <= 3)) {
      return {
        tier: 'godlike', label: 'GODLIKE', emoji: '🔥',
        color: 0xFFD700,
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
        tier: 'good', label: 'SOLID', emoji: '💪',
        color: 0x2ECC71,
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
        tier: 'average', label: 'DECENT', emoji: '👍',
        color: 0x27AE60,
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
      tier: 'boosted', label: 'BOOSTED', emoji: '🍀',
      color: 0x1ABC9C,
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

  // ── LOSS ──────────────────────────────────────────────────────────────────
  // Exception: 20+ kills = the ONE time we acknowledge the effort
  if (kills >= 20) {
    return {
      tier: 'unlucky', label: 'UNLUCKY', emoji: '😔',
      color: 0x95A5A6,
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
      tier: 'int', label: 'INTING', emoji: '🪦',
      color: 0xE74C3C,
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
      tier: 'bad', label: 'FEEDING', emoji: '😬',
      color: 0xE67E22,
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
      tier: 'bad', label: 'STATS PLAYER', emoji: '📦',
      color: 0xE67E22,
      title: '💀 DEFEAT — KDA Merchant',
      comments: [
        'Good KDA. Still lost. You\'re the problem. 📦',
        'Stats player detected. Zero impact. 🗿',
        'Pretty numbers. Ugly result. Explain yourself. 🤡',
        'Bro was farming stats while the base burned. 🔥',
        'KDA doesn\'t win games bro. Objectives do. Skill issue. 📉',
        'High KDA = you were avoiding fights. Coward arc. 😤',
        'The scoreboard looks nice in your loss screen tho. 👍',
      ],
    };
  }

  return {
    tier: 'average', label: 'INTER', emoji: '😤',
    color: 0xC0392B,
    title: '💀 DEFEAT — Mid at Best',
    comments: [
      'Mid at best. And that\'s generous. 😤',
      'Contribution: minimal. Result: terrible. Classic. 💔',
      'You were there. Barely. 🪑',
      'Not the worst. Just close to it.',
      'Replacement level player behaviour. 📋',
      'Bro was AFK mentally the whole game. 🧠❌',
    ],
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function kdaEmoji(kills, deaths, assists) {
  const kda = (kills + assists) / Math.max(deaths, 1);
  if (kda >= 5)  return '🔥';
  if (kda >= 3)  return '⚡';
  if (kda >= 2)  return '👍';
  if (kda >= 1)  return '😐';
  return '💩';
}

function deathsLabel(deaths) {
  if (deaths >= 15) return `${deaths}  🪦🪦🪦`;
  if (deaths >= 10) return `${deaths}  🪦🪦`;
  if (deaths >= 7)  return `${deaths}  🪦`;
  return `${deaths}`;
}

// Colored badge for the performance tier — uses backtick highlight for emphasis
function perfBadge(perf) {
  const squares = {
    godlike:  '🥇',
    good:     '🟢',
    average:  '🟡',
    boosted:  '🍀',
    int:      '🟥',
    bad:      '🟠',
    unlucky:  '🔵',
  };
  const sq = squares[perf.tier] || '⬜';
  return `${sq}  \`  ${perf.label}  \``;
}


// ---------------------------------------------------------------------------
// Giphy
// ---------------------------------------------------------------------------

const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

// Search terms per performance tier
const GIPHY_QUERIES = {
  godlike:  'gaming domination win',
  good:     'gg easy win gaming',
  average:  'barely made it gaming',
  boosted:  'lucky win gaming',
  int:      'this is fine fire meme',
  bad:      'skill issue gaming fail',
  unlucky:  'useless teammates meme',
};

async function fetchGif(tier) {
  if (!GIPHY_API_KEY) return null;
  try {
    const query    = encodeURIComponent(GIPHY_QUERIES[tier] || 'gaming fail');
    const url      = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=10&rating=pg-13`;
    const res      = await fetch(url);
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data?.length) return null;
    const gif = data[Math.floor(Math.random() * data.length)];
    return gif.images?.downsized?.url || gif.images?.original?.url || null;
  } catch {
    return null;
  }
}

async function fetchMeme() {
  try {
    const res = await fetch('https://api.imgflip.com/get_memes');
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data?.memes?.length) return null;
    const meme = data.memes[Math.floor(Math.random() * data.memes.length)];
    return meme.url || null;
  } catch {
    return null;
  }
}

// 50/50 each notification: either a Giphy GIF or an Imgflip meme image
async function fetchMedia(tier) {
  if (Math.random() < 0.5) {
    return await fetchGif(tier);
  }
  return await fetchMeme();
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE))
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.warn('Could not load state.json — starting fresh.', err.message);
  }
  return { last_match_ids: {} };
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
    const res = await fetch(`https://api.opendota.com/api/players/${accountId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      name:   data.profile?.personaname || `Player ${accountId}`,
      avatar: data.profile?.avatarfull  || null,
      url:    `https://www.opendota.com/players/${accountId}`,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Embed builder
// ---------------------------------------------------------------------------

function buildEmbed(match, accountId, profile, gifUrl = null) {
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
  const comment  = pickRandom(perf.comments);
  const kdaRatio = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);

  const authorName = profile
    ? `${mention}${profile.name}`
    : `${mention}Player ${accountId}`;

  // SEP in description forces embed to full width
  const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

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
      SEP,
    ].join('\n'),
    color: perf.color,
    url: matchUrl,
    thumbnail: imgUrl ? { url: imgUrl } : undefined,
    image: gifUrl ? { url: gifUrl } : undefined,
    fields: [
      // Row 1: K / D / A
      { name: '⚔️  Kills',   value: `**${kills}**`,                                          inline: true },
      { name: '💀  Deaths',  value: `**${deathsLabel(deaths)}**`,                            inline: true },
      { name: '🤝  Assists', value: `**${assists}**`,                                         inline: true },
      // Spacer
      { name: '\u200b', value: '\u200b', inline: false },
      // Row 2: KDA / Duration / Mode
      { name: `📊  KDA ${kdaEmoji(kills, deaths, assists)}`, value: `**${kdaRatio}**`,        inline: true },
      { name: '⏱️  Duration', value: `**${mins}m ${String(secs).padStart(2, '0')}s**`,       inline: true },
      { name: '🎮  Mode',    value: `**${mode}**`,                                            inline: true },
      // Spacer
      { name: '\u200b', value: '\u200b', inline: false },
      // Row 3: Hero / Match
      { name: '🦸  Hero',   value: `**${heroName(hero_id)}**`,                               inline: true },
      { name: '🆔  Match',  value: `**[${match_id}](${matchUrl})**`,                         inline: true },
    ],
    footer: {
      text:     `Dota 2 Tracker  •  Player ${accountId}`,
      icon_url: profile?.avatar || undefined,
    },
    timestamp: new Date(start_time * 1000).toISOString(),
  };

  if (!imgUrl) delete embed.thumbnail;

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
// Per-player logic
// ---------------------------------------------------------------------------

async function processPlayer(accountId, state) {
  console.log(`\n— Player ${accountId} —`);

  const [matches, profile] = await Promise.all([
    fetchRecentMatches(accountId),
    fetchPlayerProfile(accountId),
  ]);

  if (profile) console.log(`  Profile: ${profile.name}`);

  if (!matches?.length) {
    console.log('  No recent matches found.');
    return;
  }

  // TEST MODE: send latest match, no state change
  if (TEST_MODE) {
    const latest = matches[0];
    const result  = isWin(latest) ? 'WIN' : 'LOSS';
    const perf    = evaluate(latest.kills, latest.deaths, latest.assists, isWin(latest));
    const gifUrl  = await fetchMedia(perf.tier);
    console.log(`  Test: match ${latest.match_id} (${result})`);
    await sendEmbed(buildEmbed(latest, accountId, profile, gifUrl));
    console.log('  Sent. State unchanged.');
    return;
  }

  const lastId = state.last_match_ids[String(accountId)];

  // First run: set baseline silently
  if (lastId === undefined) {
    state.last_match_ids[String(accountId)] = matches[0].match_id;
    console.log(`  First run — baseline set to ${matches[0].match_id}. No notifications.`);
    return;
  }

  const newMatches = matches
    .filter(m => m.match_id > lastId)
    .sort((a, b) => a.match_id - b.match_id);

  if (!newMatches.length) {
    console.log(`  No new matches since ${lastId}.`);
    return;
  }

  console.log(`  ${newMatches.length} new match(es).`);
  let sent = 0;

  for (const match of newMatches) {
    const won = isWin(match);
    console.log(`  Match ${match.match_id}: ${won ? 'WIN' : 'loss'}`);
    if (won) {
      const perf   = evaluate(match.kills, match.deaths, match.assists, true);
      const gifUrl = await fetchMedia(perf.tier);
      await sendEmbed(buildEmbed(match, accountId, profile, gifUrl));
      sent++;
    }
  }

  state.last_match_ids[String(accountId)] = newMatches[newMatches.length - 1].match_id;
  console.log(`  Notified ${sent} win(s). State updated.`);
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

  for (const id of PLAYER_IDS) {
    try {
      await processPlayer(id, state);
    } catch (err) {
      console.error(`  Error for player ${id}:`, err.message);
    }
  }

  if (!TEST_MODE) {
    saveState(state);
    console.log('\nState saved.');
  } else {
    console.log('\nTest done. state.json unchanged.');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
