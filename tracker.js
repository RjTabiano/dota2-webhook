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
 * Tiers (loss): 'int'     | 'bad'  | 'average' | 'unlucky'
 */
function evaluate(kills, deaths, assists, won) {
  const kda = (kills + assists) / Math.max(deaths, 1);

  if (won) {
    if (kda >= 5 || (kills >= 15 && deaths <= 3)) {
      return {
        tier: 'godlike', label: 'GODLIKE', emoji: '🔥',
        color: 0xFFD700, // gold
        title: '🏆 VICTORY — Absolute Domination',
        comments: [
          'Built different. Enemies are uninstalling. 🔥',
          'RAMPAGE energy. GG no re. 👑',
          'Did you even let them spawn? Insane.',
          'Cooked them alive. Certified carry. 🍳',
        ],
      };
    }
    if (kda >= 2.5) {
      return {
        tier: 'good', label: 'SOLID', emoji: '💪',
        color: 0x2ECC71, // green
        title: '🏆 VICTORY — Clean Game',
        comments: [
          'Carried responsibly. MMR up. 📈',
          'That\'s how it\'s done. GG EZ.',
          'No notes. Solid from start to finish.',
          'Consistent. Reliable. Scary.',
        ],
      };
    }
    if (kda >= 1.5) {
      return {
        tier: 'average', label: 'DECENT', emoji: '👍',
        color: 0x27AE60,
        title: '🏆 VICTORY — Close One',
        comments: [
          'A win is a win. Take it and walk. 🤷',
          'Ugly but effective. We take those.',
          'Not your best, but the scoreboard says W.',
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
      ],
    };
  }

  // ── LOSS ──────────────────────────────────────────────────────────────────
  if (deaths >= 12 || kda < 0.5) {
    return {
      tier: 'int', label: 'INTING', emoji: '🪦',
      color: 0xE74C3C, // red
      title: '💀 DEFEAT — Certified Thrower',
      comments: [
        'Trash, bro throwing 🗑️',
        'Certified int machine. 0 game sense. 🤖',
        'Bro fed more than a food truck. 🌮💀',
        'Who gave this man internet access? 💀',
        'Delete Dota. Respectfully. 🗑️',
        'The enemy carry personally thanks you. 🫡',
        'Bro was playing for the other team. 😭',
      ],
    };
  }
  if (deaths >= 7 || kda < 1) {
    return {
      tier: 'bad', label: 'FEEDING', emoji: '😬',
      color: 0xE67E22, // orange
      title: '💀 DEFEAT — Skill Issue',
      comments: [
        'Bro played like it\'s his first game. 🤡',
        'Skill issue detected. 🔍',
        'Negative impact player. Classic.',
        'That was rough to watch. 👀',
        'Even the courier had better positioning.',
      ],
    };
  }
  if (kda >= 3) {
    return {
      tier: 'unlucky', label: 'UNLUCKY', emoji: '😔',
      color: 0x95A5A6, // grey
      title: '💀 DEFEAT — Carried 4 Feeders',
      comments: [
        'You did your part. Teammates diff. 😔',
        'Hard to win 1v9. Respect. 🫡',
        'Carried 4 feeders and still lost. Tragic. 💔',
        'This was a rescue mission, not a Dota game.',
      ],
    };
  }
  return {
    tier: 'average', label: 'MEH', emoji: '😤',
    color: 0xC0392B,
    title: '💀 DEFEAT — Tried. Failed.',
    comments: [
      'Tried. Teammates diff. 😤',
      'Close game, still an L. 💔',
      'Could\'ve been worse. Still bad though.',
      'Not your fault. Also not not your fault.',
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

// Full-width divider line between sections
const DIVIDER = { name: '\u200b', value: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', inline: false };

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

function buildEmbed(match, accountId, profile) {
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
    ].join('\n'),
    color: perf.color,
    url: matchUrl,
    thumbnail: imgUrl ? { url: imgUrl } : undefined,
    fields: [
      // ── Section 1: K / D / A ───────────────────────────────────────────────
      DIVIDER,
      {
        name:   '⚔️  Kills',
        value:  `**${kills}**`,
        inline: true,
      },
      {
        name:   '💀  Deaths',
        value:  `**${deathsLabel(deaths)}**`,
        inline: true,
      },
      {
        name:   '🤝  Assists',
        value:  `**${assists}**`,
        inline: true,
      },

      // ── Section 2: derived stats ───────────────────────────────────────────
      DIVIDER,
      {
        name:   `📊  KDA  ${kdaEmoji(kills, deaths, assists)}`,
        value:  `**${kdaRatio}**`,
        inline: true,
      },
      {
        name:   '⏱️  Duration',
        value:  `**${mins}m ${String(secs).padStart(2, '0')}s**`,
        inline: true,
      },
      {
        name:   '🎮  Mode',
        value:  `**${mode}**`,
        inline: true,
      },

      // ── Section 3: hero + match ────────────────────────────────────────────
      DIVIDER,
      {
        name:   '🦸  Hero',
        value:  `**${heroName(hero_id)}**`,
        inline: true,
      },
      {
        name:   '🆔  Match',
        value:  `**[${match_id}](${matchUrl})**`,
        inline: true,
      },
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
    const result = isWin(latest) ? 'WIN' : 'LOSS';
    console.log(`  Test: match ${latest.match_id} (${result})`);
    await sendEmbed(buildEmbed(latest, accountId, profile));
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
      await sendEmbed(buildEmbed(match, accountId, profile));
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
