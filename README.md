# Dota 2 Match Tracker

Monitors a group of Dota 2 players via the OpenDota API and posts match result embeds to a Discord channel via webhook. Runs on GitHub Actions, triggered externally by cron-job.org.

## Features

- Per-player match embeds with hero image, item grid thumbnail, KDA, and performance rating
- Party detection — players on the same match and team get a single squad embed
- Win/loss streak tracking with escalating comments
- `@everyone` ping on 3+ solo loss streaks
- MVP highlight for parties of 3 or more
- Worst-performer roast on party losses (tagged Discord users only)
- Special Devil Hans tag when the squad wins 5 straight without him
- Meme GIFs via Giphy/imgflip, with specific Tenor GIFs for milestone streaks
- Retry logic on all OpenDota API calls to handle transient failures
- Test mode — posts latest match for each player without updating state

## Project Structure

```
tracker.js              Entry point
src/
  config.js             Env vars, player maps, game mode names
  utils.js              sleep, pickRandom, kdaEmoji, formatDuration, withRetry, isWin
  state.js              Load and save state.json
  api/
    opendota.js         OpenDota API — recent matches, match items, player profile
    discord.js          Discord webhook sender (embed + attachment)
    media.js            Giphy, imgflip, and Tenor GIF fetchers
  game/
    heroes.js           Hero and item data fetch and lookup
    performance.js      KDA-based performance tier evaluation
    comments.js         All roast text, streak comments, and cause lines
  embeds/
    canvas.js           Hero + item grid PNG generator (@napi-rs/canvas)
    solo.js             Solo match embed builder
    party.js            Party match embed builder
  processor.js          Match orchestration, streak updates, test mode, main()
state.json              Persisted last match IDs and streak counters
```

## Setup

### GitHub Secrets

| Secret | Description |
|---|---|
| `DISCORD_WEBHOOK_URL` | Discord channel webhook URL |
| `PLAYERS` | Comma-separated OpenDota account IDs |
| `DISCORD_USER_MAP` | JSON object mapping account ID → Discord user ID |
| `GIPHY_API_KEY` | Giphy API key for GIF fetching |

### Local Testing

```bash
DISCORD_WEBHOOK_URL="..." \
PLAYERS="123,456,789" \
GIPHY_API_KEY="..." \
TEST_MODE=true \
node tracker.js
```

Test mode posts the latest match for each player using real streak data from `state.json`, but does **not** update state.

## How It Works

1. **Trigger** — cron-job.org hits the GitHub Actions `workflow_dispatch` endpoint on a schedule
2. **Fetch** — recent matches and profiles for all players are fetched in parallel from OpenDota
3. **Group** — players on the same match ID and team are grouped as a party; others are solo
4. **Streak** — win/loss streaks are updated in `state.json` per player
5. **Embed** — solo or party embed is built with KDA, performance tier, streak line, and GIF
6. **Send** — embed posted to Discord; solo embeds include an attached hero+items thumbnail PNG
7. **Persist** — updated `state.json` is committed back to the repo via `git push`

## Adding a Player

1. Find their OpenDota account ID (from their profile URL)
2. Add to the `PLAYERS` GitHub secret (comma-separated)
3. Optionally add a display alias in `src/config.js` under `PLAYER_ALIASES`
4. Optionally add their Discord user ID in `DEFAULT_DISCORD_MAP` in `src/config.js`
