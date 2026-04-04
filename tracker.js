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

// AKA display names: accountId → friendly alias shown in embeds
const PLAYER_ALIASES = {
  '401560620': 'Boog Bautista',
  '374195236': 'Devil Hans',
  '495360748': 'Maulakas',
};

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
const itemData = {};

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

async function fetchItemNames() {
  try {
    const res = await fetch('https://api.opendota.com/api/constants/items');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    for (const [key, val] of Object.entries(data)) {
      if (val.id != null) {
        itemData[val.id] = {
          name: val.dname || key.replace('item_', '').replace(/_/g, ' '),
          slug: key.replace('item_', ''),
        };
      }
    }
    console.log(`Loaded ${Object.keys(itemData).length} items.`);
  } catch (err) {
    console.warn('Could not load item names:', err.message);
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
        causes: ['Untouchable performance', 'Pure mechanical domination', 'Carried the whole lobby'],
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
        causes: ['Clean and consistent play', 'No major mistakes', 'Solid execution all game'],
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
        causes: ['Barely enough to secure the W', 'Average game, lucky result', 'Teammates picked up the slack'],
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
      causes: ['Carried by teammates', 'Right place, wrong game', 'Lucky matchmaking gods'],
      comments: [
        'Teammates carried you. Buy them a drink. 🍺',
        'How did you even win playing like that? 😭',
        'The matchmaking gods smiled on you today. 🙏',
        'Lucky win. Don\'t make it a habit. 😬',
        'Your team deserves the credit. Not you. 💀',
      ],
    };
  }

  if (kills > deaths + 15) {
    return {
      tier: 'unlucky', label: 'UNLUCKY', emoji: '😔', color: 0x95A5A6,
      title: '💀 DEFEAT — Actually Tried',
      causes: ['Abandoned by teammates', 'Impossible to carry these 4', '1v9 situation'],
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
      causes: ['Overfeeding enemy carry', 'Zero game sense', 'Dying for absolutely no reason'],
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
      causes: ['Dying too often', 'Poor positioning all game', 'Getting caught out repeatedly'],
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
      causes: ['Farming stats instead of objectives', 'KDA over impact', 'Avoiding fights while base burned'],
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
    causes: ['Below average impact', 'Barely showed up', 'Not enough to make a difference'],
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
  'Bro got carried so hard he should send his teammates a gift card. 🎁',
  'Negative impact. Positive result. Your teammates are built different. 💪',
  'You were a spectator with a hero skin. GG to your team. 👏',
  'Lucky you had good teammates. You were NOT the reason this was won. 😭',
  'Statistically speaking, you were a liability. But here\'s your W anyway. 🏆',
];

function getStreakComment(streak, names) {
  const who = names.length > 1 ? 'These grandpas' : `${names[0]} the grandpa`;
  if (streak >= 5) return `${streak} WIN STREAK 👴💀 ${who} refuse to log off. Someone unplug their router.`;
  if (streak >= 4) return `${streak} wins in a row 👴🔥 ${who} are in their villain arc. Be scared.`;
  if (streak >= 3) return `${streak} streak! 👴 Old man strength is REAL. ${who} are NOT slowing down.`;
  return `${streak} wins in a row. The grandpas are active today 👴 Probably won't last but here we are.`;
}

function getLossStreakComment(streak, names) {
  const who  = names.length > 1 ? 'These guys' : names[0];
  const them = names.length > 1 ? 'they' : 'he';
  if (streak >= 5) return `🚨 **${streak} LOSS STREAK** 🚨 ${who} need an intervention. Someone take the keyboard away. Uninstall. Seek therapy. Touch grass. 🗑️`;
  if (streak >= 4) return `💀 **${streak} losses in a row.** ${who} are cooked. Actually cooked. No coming back from this. Delete Dota. 🗑️`;
  if (streak >= 3) return `📉 **${streak} straight Ls.** Is ${them} okay? This is a cry for help. Someone check on ${them}. 🚨`;
  return `📉 **${streak} losses in a row.** The decline is real. Back to back embarrassments. 😭`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function kdaEmoji(kda) {
  if (kda >= 5) return '🔥';
  if (kda >= 3) return '⚡';
  if (kda >= 2) return '👍';
  if (kda >= 1) return '😐';
  return '💩';
}

function getCause(kills, deaths, assists, tier, won) {
  if (won) {
    if (kills >= 15) return pickRandom(['Drank G-Fuel', 'Enemy team threw', 'Actual god gamer']);
    if (deaths >= 10) return 'Carried by the team';
    if (assists >= 20) return 'Support life';
    return pickRandom(['Better gaming chair', 'Matchmaking gods smiled']);
  } else {
    if (deaths >= 12) return 'Overfeeding frontline';
    if (kills >= 15) return 'Team is too heavy';
    if (kills <= 2 && assists <= 5) return 'Pacifist run';
    if (deaths > kills * 3) return 'Certified inting';
    return pickRandom(['Screen was off', 'Brain lag', 'Skill issue', 'Cat walked on keyboard']);
  }
}

// Hashtag-style badges like the NBA stat card
function tags(...items) {
  return items.map(t => `\`#${t.toUpperCase().replace(/\s+/g, '-')}\``).join('  ');
}

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
    const q      = encodeURIComponent(GIPHY_QUERIES[tier] || 'gaming');
    const offset = Math.floor(Math.random() * 50); // random page for variety
    const res    = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${q}&limit=25&offset=${offset}&rating=pg-13`);
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
// Inventory image generator
// ---------------------------------------------------------------------------

// Generates a vertical composite: hero image on top, 3x2 item grid below.
// Used as the embed thumbnail so the meme/GIF image slot stays free.
async function generateHeroWithItems(heroId, itemIds) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');

  const W = 220; // fixed canvas width

  // Hero section — Steam CDN heroes are 256×144 (16:9)
  const heroH = Math.round(W * (144 / 256));

  // Item grid section
  const COLS = 3, ROWS = 2;
  const SLOT_W = Math.floor((W - 4) / COLS); // fill width
  const SLOT_H = Math.round(SLOT_W * (64 / 88)); // keep item aspect ratio
  const GAP = 2, PAD = 2;
  const gridH = PAD + ROWS * SLOT_H + (ROWS - 1) * GAP + PAD;

  const canvasH = heroH + gridH;
  const canvas  = createCanvas(W, canvasH);
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = '#0d0e14';
  ctx.fillRect(0, 0, W, canvasH);

  // Draw hero image
  const heroSlug = heroData[heroId]?.slug;
  if (heroSlug) {
    try {
      const img = await loadImage(`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${heroSlug}.png`);
      ctx.drawImage(img, 0, 0, W, heroH);
    } catch { /* leave dark */ }
  }

  // Draw item grid below hero
  for (let i = 0; i < 6; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x   = PAD + col * (SLOT_W + GAP);
    const y   = heroH + PAD + row * (SLOT_H + GAP);

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(x, y, SLOT_W, SLOT_H);

    const id = itemIds[i];
    if (id && itemData[id]?.slug) {
      try {
        const img = await loadImage(`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${itemData[id].slug}.png`);
        ctx.drawImage(img, x, y, SLOT_W, SLOT_H);
      } catch { /* empty slot */ }
    }

    ctx.strokeStyle = '#2e3048';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, SLOT_W - 1, SLOT_H - 1);
  }

  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) { console.warn('Could not load state.json — starting fresh.', err.message); }
  return { last_match_ids: {}, win_streaks: {}, loss_streaks: {} };
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

// Cache so party members in the same match only trigger one fetch
const matchDetailCache = {};

async function fetchMatchItems(matchId, accountId) {
  if (!matchDetailCache[matchId]) {
    try {
      const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`);
      matchDetailCache[matchId] = res.ok ? await res.json() : null;
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

function buildEmbed(match, accountId, profile, gifUrl = null, streak = 0, lossStreak = 0) {
  const won      = isWin(match);
  const { kills, deaths, assists, duration, game_mode, match_id, start_time, hero_id } = match;
  const perf     = evaluate(kills, deaths, assists, won);
  const matchUrl = `https://www.opendota.com/matches/${match_id}`;
  const discId   = DISCORD_USER_MAP[String(accountId)];
  const mention  = discId ? `<@${discId}>` : '';
  const mins     = Math.floor(duration / 60);
  const secs     = duration % 60;
  const mode     = GAME_MODES[game_mode] || `Mode ${game_mode}`;
  const imgUrl   = heroImageUrl(hero_id);
  const kdaRatio = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);

  const isBadWin   = won && deaths >= kills;
  const comment    = isBadWin ? pickRandom(BAD_WIN_ROASTS) : pickRandom(perf.comments);
  const steamName  = profile?.name || `Player ${accountId}`;
  const alias      = PLAYER_ALIASES[String(accountId)];
  const playerName = alias || steamName;
  const authorLabel = alias ? `${alias}  ·  ${steamName}` : steamName;

  const streakLine = streak >= 2
    ? `🔥 **${getStreakComment(streak, [playerName])}**`
    : lossStreak >= 2
    ? getLossStreakComment(lossStreak, [playerName])
    : '';

  const dur    = `${mins}m ${String(secs).padStart(2, '0')}s`;
  const kdaVal = parseFloat(kdaRatio);
  const cause  = getCause(kills, deaths, assists, perf.tier, won);

  const descParts = [
    mention ? `${mention} *"${comment}"*` : `*"${comment}"*`,
    ...(streakLine ? ['> ' + streakLine] : []),
    '',
    `📈 **${kills} / ${deaths} / ${assists}** • **${kdaRatio}** KDA ${kdaEmoji(kdaVal)}`,
    '',
    `**💀 Performance:** ${perf.emoji} **${perf.label}**`,
    `**🧽 Cause:** ${cause}`,
    '',
    `**${won ? '✅' : '❌'}** ${dur} • ${mode}`,
    `🔗 [View Match](${matchUrl})`
  ];

  const embed = {
    // Large bold header matching the screenshot: "💀 DEFEAT — SAGA (Centaur Warrunner)"
    title:     `${won ? '🏆 VICTORY' : '💀 DEFEAT'} — ${playerName} (${heroName(hero_id)})`,
    url:       matchUrl,
    author:    profile?.avatar ? { name: authorLabel, icon_url: profile.avatar, url: profile.url } : undefined,
    thumbnail: imgUrl ? { url: imgUrl } : undefined,
    description: descParts.join('\n'),
    color:       perf.color,
    image:       gifUrl ? { url: gifUrl } : undefined,
    footer:      { text: `Match ID: ${match_id}`, icon_url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png' },
    timestamp:   new Date(start_time * 1000).toISOString(),
  };

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

  const comment = pickRandom(won ? PARTY_WIN_COMMENTS : PARTY_LOSS_COMMENTS);
  const title   = won ? '🏆 SQUAD WIN — Party Victory' : '💀 SQUAD LOSS — Party Diff';
  const color   = won ? 0xFFD700 : 0xE74C3C;
  const dur     = `${mins}m ${String(secs).padStart(2, '0')}s`;

  // Streak lines per member
  const streakLines = [
    ...players.filter(p => (p.streak     || 0) >= 2).map(p => `🔥 **${getStreakComment(p.streak,     [PLAYER_ALIASES[String(p.accountId)] || p.profile?.name || `Player ${p.accountId}`])}**`),
    ...players.filter(p => (p.lossStreak || 0) >= 2).map(p => getLossStreakComment(p.lossStreak, [PLAYER_ALIASES[String(p.accountId)] || p.profile?.name || `Player ${p.accountId}`])),
  ];

  // MVP — highest KDA among players (only shown for 3+)
  let mvpLine = '';
  if (players.length >= 3) {
    const mvp     = players.reduce((best, p) => {
      const kdaVal = (p.match.kills + p.match.assists) / Math.max(p.match.deaths, 1);
      const bestKda = (best.match.kills + best.match.assists) / Math.max(best.match.deaths, 1);
      return kdaVal > bestKda ? p : best;
    });
    const alias   = PLAYER_ALIASES[String(mvp.accountId)];
    const mvpName = alias || mvp.profile?.name || `Player ${mvp.accountId}`;
    const mvpKda  = ((mvp.match.kills + mvp.match.assists) / Math.max(mvp.match.deaths, 1)).toFixed(2);
    mvpLine = `🏅 **MVP: ${mvpName}** *(${heroName(mvp.match.hero_id)})* — \`${mvp.match.kills}/${mvp.match.deaths}/${mvp.match.assists}\` KDA **${mvpKda}** ${kdaEmoji(parseFloat(mvpKda))}`;
  }

  // Per-player stat lines — one line each, no code block (avoids wrapping)
  const playerLines = players.map(p => {
    const { kills, deaths, assists, hero_id } = p.match;
    const kda       = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);
    const isBadWin  = won && deaths >= kills;
    const badFlag   = isBadWin ? ' 🗑️' : '';
    const alias     = PLAYER_ALIASES[String(p.accountId)];
    const name      = alias || p.profile?.name || `Player ${p.accountId}`;
    const discId    = DISCORD_USER_MAP[String(p.accountId)];
    const mention   = discId ? `<@${discId}> ` : '';
    const perfEmoji = kdaEmoji(parseFloat(kda));
    return `${mention}**${name}** *(${heroName(hero_id)})*\n> \`${kills} / ${deaths} / ${assists}\`  KDA **${kda}** ${perfEmoji}${badFlag}`;
  });

  const descParts = [
    `${won ? '🎉' : '💀'} *"${comment}"*`,
    ...(streakLines.length ? ['', ...streakLines] : []),
    ...(mvpLine ? ['', mvpLine] : []),
    '',
    ...playerLines,
    '',
    `**${won ? '✅' : '❌'}** ${dur}  •  ${mode}`,
    `🔗 [View Match](${matchUrl})`,
  ];

  const embed = {
    title,
    description: descParts.join('\n'),
    color,
    url:    matchUrl,
    image:  gifUrl ? { url: gifUrl } : undefined,
    fields: [],
    footer:    { text: `Match ID: ${first.match_id}`, icon_url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png' },
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

// Send embed with hero+items thumbnail as attachment. Meme stays in embed.image as a URL.
async function sendEmbedWithThumb(embed, thumbBuffer) {
  embed.thumbnail = { url: 'attachment://thumb.png' };
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ embeds: [embed] }));
  form.append('files[0]', new Blob([thumbBuffer], { type: 'image/png' }), 'thumb.png');
  const res = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });
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
        const id = String(p.accountId);
        if (won) {
          state.win_streaks[id]  = (state.win_streaks[id]  || 0) + 1;
          state.loss_streaks[id] = 0;
        } else {
          state.loss_streaks[id] = (state.loss_streaks[id] || 0) + 1;
          state.win_streaks[id]  = 0;
        }
        p.streak     = state.win_streaks[id];
        p.lossStreak = state.loss_streaks[id];
      }

      const gifUrl = await fetchMedia('party');
      await sendEmbed(buildPartyEmbed(group, gifUrl));

    } else {
      // ── SOLO MATCH ─────────────────────────────────────────────────────────
      const { accountId, match, profile } = group[0];
      console.log(`  Solo match ${match.match_id} (${accountId}): ${won ? 'WIN' : 'LOSS'}`);

      const sid = String(accountId);
      if (won) {
        state.win_streaks[sid]  = (state.win_streaks[sid]  || 0) + 1;
        state.loss_streaks[sid] = 0;
      } else {
        state.loss_streaks[sid] = (state.loss_streaks[sid] || 0) + 1;
        state.win_streaks[sid]  = 0;
      }
      const streak = state.win_streaks[sid];

      const id2        = String(accountId);
      const lossStreak = state.loss_streaks[id2] || 0;
      const perf       = evaluate(match.kills, match.deaths, match.assists, won);
      const [gifUrl, items] = await Promise.all([fetchMedia(perf.tier), fetchMatchItems(match.match_id, accountId)]);
      if (items.length) {
        // Hero+items as thumbnail attachment; meme stays in image slot
        const embed    = buildEmbed(match, accountId, profile, gifUrl, streak, lossStreak);
        const thumbBuf = await generateHeroWithItems(match.hero_id, items);
        await sendEmbedWithThumb(embed, thumbBuf);
      } else {
        await sendEmbed(buildEmbed(match, accountId, profile, gifUrl, streak, lossStreak));
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

  await Promise.all([fetchHeroNames(), fetchItemNames()]);
  const state = loadState();
  if (!state.win_streaks)  state.win_streaks  = {};
  if (!state.loss_streaks) state.loss_streaks = {};

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
        const [gifUrl, items] = await Promise.all([fetchMedia(perf.tier), fetchMatchItems(latest.match_id, accountId)]);
        console.log(`  Test: ${accountId} (${profile?.name}) — match ${latest.match_id}, items: ${items.length}`);
        if (items.length) {
          const embed    = buildEmbed(latest, accountId, profile, gifUrl, 0, 0);
          const thumbBuf = await generateHeroWithItems(latest.hero_id, items);
          await sendEmbedWithThumb(embed, thumbBuf);
        } else {
          await sendEmbed(buildEmbed(latest, accountId, profile, gifUrl, 0, 0));
        }
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
