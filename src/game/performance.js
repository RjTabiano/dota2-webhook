'use strict';

const TIERS = {
  godlike: {
    tier: 'godlike', label: 'GODLIKE', emoji: '🔥', color: 0xFFD700,
    comments: [
      'Built different. Enemies are uninstalling. 🔥',
      'RAMPAGE energy. GG no re. 👑',
      'Cooked them alive. Certified carry. 🍳',
      'Bro said "I\'ll do it myself" and did. 💪',
      'The enemy is now in therapy. Respect. 🏆',
    ],
  },
  good: {
    tier: 'good', label: 'SOLID', emoji: '💪', color: 0x2ECC71,
    comments: [
      'Carried responsibly. MMR up. 📈',
      'That\'s how it\'s done. GG EZ.',
      'No notes. Solid from start to finish.',
      'Consistent. Reliable. Actually scary.',
    ],
  },
  average: {
    tier: 'average', label: 'DECENT', emoji: '👍', color: 0x27AE60,
    comments: [
      'A win is a win. Take it and walk. 🤷',
      'Ugly but effective. We take those.',
      'Not your best but the scoreboard says W.',
      'Could\'ve been cleaner but hey, green is green.',
    ],
  },
  boosted: {
    tier: 'boosted', label: 'BOOSTED', emoji: '🍀', color: 0x1ABC9C,
    comments: [
      'Teammates carried you. Buy them a drink. 🍺',
      'How did you even win playing like that? 😭',
      'The matchmaking gods smiled on you today. 🙏',
      'Lucky win. Don\'t make it a habit. 😬',
      'Your team deserves the credit. Not you. 💀',
    ],
  },
  unlucky: {
    tier: 'unlucky', label: 'UNLUCKY', emoji: '😔', color: 0x95A5A6,
    comments: [], // populated dynamically with kill count in evaluate()
  },
  int: {
    tier: 'int', label: 'INTING', emoji: '🪦', color: 0xE74C3C,
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
  },
  bad: {
    tier: 'bad', label: 'FEEDING', emoji: '😬', color: 0xE67E22,
    comments: [
      'Bro played like it\'s his first game. 🤡',
      'Skill issue detected. Very clearly. 🔍',
      'Negative impact player. Classic behaviour.',
      'That was rough to watch. Everyone in the lobby felt that. 👀',
      'Even the courier had better positioning. Embarrassing.',
      'This is why your MMR looks like that. 📉',
      'Reported for griefing. By your own team. 🚨',
    ],
  },
  statsPlayer: {
    tier: 'bad', label: 'STATS PLAYER', emoji: '📦', color: 0xE67E22,
    comments: [
      'Good KDA. Still lost. You\'re the problem. 📦',
      'Stats player detected. Zero impact. 🗿',
      'Pretty numbers. Ugly result. Explain yourself. 🤡',
      'Bro was farming stats while the base burned. 🔥',
      'KDA doesn\'t win games bro. Objectives do. 📉',
      'High KDA = you were avoiding fights. Coward arc. 😤',
    ],
  },
  inter: {
    tier: 'average', label: 'INTER', emoji: '😤', color: 0xC0392B,
    comments: [
      'Mid at best. And that\'s generous. 😤',
      'Contribution: minimal. Result: terrible. 💔',
      'You were there. Barely. 🪑',
      'Not the worst. Just close to it.',
      'Replacement level player behaviour. 📋',
      'Bro was AFK mentally the whole game. 🧠❌',
    ],
  },
};

function evaluate(kills, deaths, assists, won) {
  const kda = (kills + assists) / Math.max(deaths, 1);

  if (won) {
    if (kda >= 5 || (kills >= 15 && deaths <= 3)) return TIERS.godlike;
    if (kda >= 2.5) return TIERS.good;
    if (kda >= 1.5) return TIERS.average;
    return TIERS.boosted;
  }

  if (kills > deaths + 15) {
    return {
      ...TIERS.unlucky,
      comments: [
        `${kills} kills and still lost?? Your team is genuinely cooked. 🍳`,
        'OK fine, you showed up. Your teammates did not. 💔',
        `${kills} kills. Carried 4 corpses. Still an L. Tragic. 😭`,
        'Genuinely a 1v9. You are not the problem. For once. 🫡',
      ],
    };
  }
  if (deaths >= 12 || kda < 0.5) return TIERS.int;
  if (deaths >= 7  || kda < 1)   return TIERS.bad;
  if (kda >= 3)                   return TIERS.statsPlayer;
  return TIERS.inter;
}

module.exports = { evaluate };
