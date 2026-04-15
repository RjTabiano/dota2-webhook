'use strict';

const { DISCORD_USER_MAP, PLAYER_ALIASES, GAME_MODES, DOTA_LOGO } = require('../config');
const { pickRandom, kdaEmoji, formatDuration, isWin }              = require('../utils');
const { heroName, heroImageUrl }                                    = require('../game/heroes');
const { evaluate }                                                  = require('../game/performance');
const { BAD_WIN_ROASTS, LOSS_ROASTS, getCause,
        getStreakComment, getLossStreakComment }                     = require('../game/comments');

function buildEmbed(match, accountId, profile, gifUrl = null, streak = 0, lossStreak = 0, aiComment = null, aiCause = null, aiStreakComment = null) {
  const won      = isWin(match);
  const { kills, deaths, assists, duration, game_mode, match_id, start_time, hero_id } = match;
  const perf     = evaluate(kills, deaths, assists, won);
  const matchUrl = `https://www.opendota.com/matches/${match_id}`;
  const discId   = DISCORD_USER_MAP[String(accountId)];
  const mention  = discId ? `<@${discId}>` : '';
  const kdaRatio = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);

  const alias      = PLAYER_ALIASES[String(accountId)];
  const steamName  = profile?.name || alias || `Player ${accountId}`;
  const playerName = alias || steamName;

  const isGoat   = kills >= 20 && deaths < 5;
  const isBadWin = won && deaths >= kills && assists < 15;
  const comment  = aiComment || (isBadWin ? pickRandom(BAD_WIN_ROASTS) : pickRandom(perf.comments));

  const streakLine     = streak >= 2     ? `🔥 **${aiStreakComment || getStreakComment(streak, [playerName])}**`
                       : lossStreak >= 2 ? (aiStreakComment || getLossStreakComment(lossStreak, [playerName]))
                       : '';
  const everyoneRoast  = lossStreak === 3 ? `@everyone someone stop ${mention || playerName} 💀` : '';
  const aggressiveLine = lossStreak > 3 && mention ? `${mention} ${pickRandom(LOSS_ROASTS)}` : '';
  const isSoloDisgrace = !won && deaths >= 15 && kills <= 2 && assists < 8;
  const disgraceLine   = isSoloDisgrace && mention ? `${mention} Tarantadooo, san mo lalagay? 💀` : '';

  const descParts = [
    ...(everyoneRoast                        ? [everyoneRoast, '']  : []),
    ...(disgraceLine                         ? [disgraceLine,  '']  : []),
    ...(aggressiveLine && !disgraceLine      ? [aggressiveLine, ''] : []),
    mention && !aggressiveLine && !disgraceLine ? `${mention} *"${comment}"*` : `*"${comment}"*`,
    ...(streakLine ? ['> ' + streakLine] : []),
    '',
    `📈 **${kills} / ${deaths} / ${assists}** • **${kdaRatio}** KDA ${kdaEmoji(parseFloat(kdaRatio))}`,
    '',
    `**💀 Performance:** ${perf.emoji} **${perf.label}**`,
    `**🧽 Cause:** ${aiCause || getCause(kills, deaths, assists, won)}`,
    '',
    `**${won ? '✅' : '❌'}** ${formatDuration(duration)} • ${GAME_MODES[game_mode] || `Mode ${game_mode}`}`,
    `🔗 [View Match](${matchUrl})`,
  ];

  return {
    title:       `${won ? '🏆 VICTORY' : '💀 DEFEAT'} — ${playerName} (${heroName(hero_id)})${isGoat ? ' 🐐' : ''}`,
    url:         matchUrl,
    author:      profile?.avatar ? { name: alias ? `${alias}  ·  ${steamName}` : steamName, icon_url: profile.avatar, url: profile.url } : undefined,
    thumbnail:   heroImageUrl(hero_id) ? { url: heroImageUrl(hero_id) } : undefined,
    description: descParts.join('\n'),
    color:       perf.color,
    image:       gifUrl ? { url: gifUrl } : undefined,
    footer:      { text: `Match ID: ${match_id}`, icon_url: DOTA_LOGO },
    timestamp:   new Date(start_time * 1000).toISOString(),
  };
}

module.exports = { buildEmbed };
