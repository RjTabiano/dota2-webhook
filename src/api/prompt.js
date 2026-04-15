'use strict';

function soloPrompt({ playerName, heroName, kills, deaths, assists, won, tier, streak, lossStreak }) {
  const kda       = ((kills + assists) / Math.max(deaths, 1)).toFixed(2);
  const hasStreak = streak >= 2 || lossStreak >= 2;
  const streakInfo = hasStreak
    ? (streak >= 2
        ? `WIN STREAK: ${streak} wins in a row`
        : `LOSS STREAK: ${lossStreak} losses in a row`)
    : null;

  return `You are a roast bot for a Dota 2 friend group chat. Return ONLY valid JSON, no markdown, no code blocks.

Player: ${playerName} on ${heroName}
Result: ${won ? 'WIN' : 'LOSS'} | Stats: ${kills}/${deaths}/${assists} | KDA: ${kda} | Rating: ${tier}${streakInfo ? `\nStreak: ${streakInfo}` : ''}

Return exactly this JSON shape:
{
  "comment": "<ONE punchy reaction, 10–14 words, end with one emoji>",
  "cause": "<ONE short reason 3–6 words why this happened, no punctuation>",
  "streakComment": ${hasStreak ? '"<ONE streak reaction, 10–14 words, end with one emoji>"' : 'null'}
}

Rules:
- comment: funny and slightly mean, Filipino slang welcome
- cause: creative and funny (e.g. "Skill issue", "Cat walked on keyboard", "Better gaming chair")
- streakComment: ${streak >= 2 ? 'hype and celebratory' : 'dramatic, sad, slightly roasting'}`;
}

function partyPrompt({ won, players, maxWin, maxLoss, streakNames }) {
  const scores    = players.map(p => `${p.name}: ${p.kills}/${p.deaths}/${p.assists}`).join(', ');
  const hasStreak = maxWin >= 2 || maxLoss >= 2;
  const streakInfo = hasStreak
    ? (maxWin >= 2
        ? `WIN STREAK: ${maxWin} wins in a row by ${streakNames.join(' and ')}`
        : `LOSS STREAK: ${maxLoss} losses in a row by ${streakNames.join(' and ')}`)
    : null;

  return `You are a roast bot for a Dota 2 friend group chat. Return ONLY valid JSON, no markdown, no code blocks.

Result: ${won ? 'SQUAD WIN' : 'SQUAD LOSS'}
Scoreboard: ${scores}${streakInfo ? `\nStreak: ${streakInfo}` : ''}

Return exactly this JSON shape:
{
  "comment": "<ONE short funny reaction, 10–14 words, end with one emoji>",
  "streakComment": ${hasStreak ? '"<ONE streak reaction, 10–14 words, end with one emoji>"' : 'null'}
}

Rules:
- comment: chaotic and funny, Filipino slang welcome
- streakComment: ${maxWin >= 2 ? 'hype and celebratory' : 'dramatic, sad, slightly roasting'}`;
}

module.exports = { soloPrompt, partyPrompt };
