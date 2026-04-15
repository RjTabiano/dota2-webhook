'use strict';

const { DISCORD_USER_MAP, PLAYER_ALIASES, GAME_MODES, DOTA_LOGO,
        DEVIL_HANS_ACCOUNT, DEVIL_HANS_DISCORD }           = require('../config');
const { pickRandom, kdaEmoji, formatDuration, isWin }      = require('../utils');
const { heroName }                                          = require('../game/heroes');
const { PARTY_WIN_COMMENTS, PARTY_LOSS_COMMENTS,
        getStreakComment, getLossStreakComment }             = require('../game/comments');

function playerKda(match) {
  return (match.kills + match.assists) / Math.max(match.deaths, 1);
}

function buildPartyEmbed(players, gifUrl = null) {
  const first    = players[0].match;
  const won      = isWin(first);
  const matchUrl = `https://www.opendota.com/matches/${first.match_id}`;

  const maxWinStreak  = Math.max(...players.map(p => p.streak     || 0));
  const maxLossStreak = Math.max(...players.map(p => p.lossStreak || 0));

  const playerName = p => PLAYER_ALIASES[String(p.accountId)] || p.profile?.name || `Player ${p.accountId}`;
  const winNames   = players.filter(p => (p.streak     || 0) === maxWinStreak  && maxWinStreak  >= 2).map(playerName);
  const lossNames  = players.filter(p => (p.lossStreak || 0) === maxLossStreak && maxLossStreak >= 2).map(playerName);

  const streakLines = maxWinStreak >= 2
    ? [`🔥 **${getStreakComment(maxWinStreak, winNames)}**`]
    : maxLossStreak >= 2
    ? [getLossStreakComment(maxLossStreak, lossNames)]
    : [];

  // MVP — highest KDA, only for parties of 3+
  let mvpLine = '';
  if (players.length >= 3) {
    const mvp    = players.reduce((best, p) => playerKda(p.match) > playerKda(best.match) ? p : best);
    const mvpKda = playerKda(mvp.match).toFixed(2);
    const mvpName = PLAYER_ALIASES[String(mvp.accountId)] || mvp.profile?.name || `Player ${mvp.accountId}`;
    mvpLine = `🏅 **MVP: ${mvpName}** *(${heroName(mvp.match.hero_id)})* — \`${mvp.match.kills}/${mvp.match.deaths}/${mvp.match.assists}\` KDA **${mvpKda}** ${kdaEmoji(parseFloat(mvpKda))}`;
  }

  // Per-player stat lines
  const playerLines = players.map(p => {
    const { kills, deaths, assists, hero_id } = p.match;
    const kda        = playerKda(p.match).toFixed(2);
    const isGoat     = kills >= 20 && deaths < 5;
    const isBadWin   = won && deaths >= kills && assists < 15;
    const isMonkey   = deaths > kills + 10 && assists < 10;
    const badFlag    = isGoat ? ' 🐐' : isMonkey ? ' 🐵' : isBadWin ? ' 🗑️' : '';
    const name       = PLAYER_ALIASES[String(p.accountId)] || p.profile?.name || `Player ${p.accountId}`;
    const discId     = DISCORD_USER_MAP[String(p.accountId)];
    const mention    = discId ? `<@${discId}>` : '';
    const isDisgrace = deaths >= 15 && kills <= 2 && assists < 8;
    const disgraceRoasts = [
      `${mention} WHAT ARE YOU DOING BRO 💀 ${kills}kills ${deaths}deaths?? GET OUT`,
      `${mention} ARE YOU OKAY?? ${deaths} DEATHS?? HAHAHAHAHAHA 💀💀💀`,
      `${mention} ${kills}/${deaths}/${assists}?? bro was playing for the other team 😭💀`,
      `${mention} this is criminal. ${deaths} deaths. Turn off your PC. 🚨💀`,
      `${mention} LMAOOOO ${deaths} deaths and only ${kills} kills?? you dragged everyone 💀`,
    ];
    const nameLine = isDisgrace && mention
      ? `${pickRandom(disgraceRoasts)}\n**${name}** *(${heroName(hero_id)})*`
      : `**${name}** *(${heroName(hero_id)})*`;
    return `${nameLine}\n> \`${kills} / ${deaths} / ${assists}\`  KDA **${kda}** ${kdaEmoji(parseFloat(kda))}${badFlag}`;
  });

  // Roast worst known player on a loss
  let worstLine = '';
  if (!won) {
    const known = players.filter(p => DISCORD_USER_MAP[String(p.accountId)]);
    if (known.length) {
      const worst   = known.reduce((bad, p) => playerKda(p.match) < playerKda(bad.match) ? p : bad);
      const wMention = `<@${DISCORD_USER_MAP[String(worst.accountId)]}>`;
      const { kills, deaths, assists } = worst.match;
      worstLine = pickRandom([
        `${wMention} HAHAHAHA ${kills}/${deaths}/${assists}?? bro dragged the whole team 💀`,
        `${wMention} ${deaths} deaths?? you were playing for the other team 💀`,
        `${wMention} LMAOOO ${kills} kills ${deaths} deaths are you okay?? 😭💀`,
        `${wMention} nah bro was inting the whole game ${kills}/${deaths}/${assists} 💀`,
        `${wMention} ${deaths} deaths and only ${kills} kills?? LOG OFF 💀`,
      ]);
    }
  }

  // Devil Hans absent when 5-win streak without him
  const devilHansTag = won && maxWinStreak >= 5 && !players.some(p => String(p.accountId) === DEVIL_HANS_ACCOUNT)
    ? `<@${DEVIL_HANS_DISCORD}> xD`
    : '';

  const descParts = [
    `${won ? '🎉' : '💀'} *"${pickRandom(won ? PARTY_WIN_COMMENTS : PARTY_LOSS_COMMENTS)}"*`,
    ...(worstLine    ? ['', worstLine]    : []),
    ...(devilHansTag ? ['', devilHansTag] : []),
    ...(streakLines.length ? ['', ...streakLines] : []),
    ...(mvpLine      ? ['', mvpLine]      : []),
    '',
    ...playerLines,
    '',
    `**${won ? '✅' : '❌'}** ${formatDuration(first.duration)}  •  ${GAME_MODES[first.game_mode] || `Mode ${first.game_mode}`}`,
    `🔗 [View Match](${matchUrl})`,
  ];

  return {
    title:       won ? '🏆 SQUAD WIN — Party Victory' : '💀 SQUAD LOSS — Party Diff',
    description: descParts.join('\n'),
    color:       won ? 0xFFD700 : 0xE74C3C,
    url:         matchUrl,
    image:       gifUrl ? { url: gifUrl } : undefined,
    fields:      [],
    footer:      { text: `Match ID: ${first.match_id}`, icon_url: DOTA_LOGO },
    timestamp:   new Date(first.start_time * 1000).toISOString(),
  };
}

module.exports = { buildPartyEmbed };
