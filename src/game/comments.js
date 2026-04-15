'use strict';

const { pickRandom } = require('../utils');

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

const LOSS_ROASTS = [
  'HAHAHAHAHAHAHAHA 💀 bro really out here losing AGAIN',
  'HAHAHAHAHAHA 💀💀 somebody stop this man',
  'LMAOOOOOO 💀 at what point do you just uninstall',
  'HAHAHAHAHAHA 💀 back at it again with another L',
  'HAHAHAHAHAHA 💀 this is actually tragic bro',
];

function getStreakComment(streak, names) {
  const who = names.length > 1 ? 'These guys' : names[0];
  const are = names.length > 1 ? 'are' : 'is';
  if (streak >= 5) return `${streak} WIN STREAK 🔥👑 ${who} ${are} LOCKED IN. Somebody stop them. Call an ambulance. 🚨`;
  if (streak >= 4) return `${streak} wins straight 🔥 ${who} ${are} on a HEATER. Call an ambulance — but not for them. 🚑`;
  if (streak >= 3) return `${streak} in a row! 🔥 ${who} ${are} built different this session. Don't touch them.`;
  return `${streak} wins back to back. ${who} actually ate tonight. 👀`;
}

function getLossStreakComment(streak, names) {
  const who  = names.length > 1 ? 'These guys' : names[0];
  const them = names.length > 1 ? 'they' : 'he';
  if (streak >= 5) return `🚨 **${streak} LOSS STREAK** 🚨 ${who} are cooked. Somebody give them one more day. 😭`;
  if (streak >= 4) return `💀 **${streak} losses in a row.** ${who} are actually cooked. No coming back. Delete Dota. 🗑️`;
  if (streak >= 3) return `📉 **${streak} straight Ls.** Is ${them} okay? This is a cry for help. Someone check on ${them}. 🚨`;
  return pickRandom([
    `📉 **2 losses in a row.** What am I even fighting for? 😔`,
    `📉 **2 losses in a row.** ${who} really out here giving everything and getting nothing back. 💔`,
    `📉 **Back to back Ls.** At this point just log off and touch grass. 🌿`,
    `📉 **2 straight losses.** The universe is NOT on ${who}'s side tonight. 😮‍💨`,
    `📉 **2 losses in a row.** It's not about the MMR. It's about the pain. 😔`,
  ]);
}

function getCause(kills, deaths, assists, won) {
  if (won) {
    if (kills >= 15)  return pickRandom(['Drank G-Fuel', 'Enemy team threw', 'Actual god gamer']);
    if (deaths >= 10) return 'Pede na';
    if (assists >= 20) return 'Support life';
    return pickRandom(['Better gaming chair', 'Matchmaking gods smiled']);
  }
  if (deaths >= 12)                return 'Overfeeding frontline';
  if (kills >= 15)                 return 'Team is too heavy';
  if (kills <= 2 && assists <= 5)  return 'Pacifist run';
  if (deaths > kills * 3)          return 'Certified inting';
  return pickRandom(['Screen was off', 'Brain lag', 'Skill issue', 'Cat walked on keyboard']);
}

module.exports = {
  PARTY_WIN_COMMENTS, PARTY_LOSS_COMMENTS, BAD_WIN_ROASTS, LOSS_ROASTS,
  getStreakComment, getLossStreakComment, getCause,
};
