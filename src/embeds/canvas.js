'use strict';

const { heroData, itemData } = require('../game/heroes');

const HERO_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes';
const ITEM_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items';
const CANVAS_W = 220;
const COLS = 3, ROWS = 2, GAP = 2, PAD = 2;

async function generateHeroWithItems(heroId, itemIds) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');

  const heroH  = Math.round(CANVAS_W * (144 / 256));
  const slotW  = Math.floor((CANVAS_W - PAD) / COLS);
  const slotH  = Math.round(slotW * (64 / 88));
  const gridH  = PAD + ROWS * slotH + (ROWS - 1) * GAP + PAD;

  const canvas = createCanvas(CANVAS_W, heroH + gridH);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#0d0e14';
  ctx.fillRect(0, 0, CANVAS_W, heroH + gridH);

  const heroSlug = heroData[heroId]?.slug;
  if (heroSlug) {
    try {
      const img = await loadImage(`${HERO_CDN}/${heroSlug}.png`);
      ctx.drawImage(img, 0, 0, CANVAS_W, heroH);
    } catch { /* leave dark on load failure */ }
  }

  for (let i = 0; i < 6; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x   = PAD + col * (slotW + GAP);
    const y   = heroH + PAD + row * (slotH + GAP);

    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(x, y, slotW, slotH);

    const slug = itemData[itemIds[i]]?.slug;
    if (slug) {
      try {
        const img = await loadImage(`${ITEM_CDN}/${slug}.png`);
        ctx.drawImage(img, x, y, slotW, slotH);
      } catch { /* empty slot */ }
    }

    ctx.strokeStyle = '#2e3048';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, slotW - 1, slotH - 1);
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generateHeroWithItems };
