'use strict';

const { withRetry } = require('../utils');

const heroData = {};
const itemData = {};

async function fetchHeroNames() {
  try {
    await withRetry(async () => {
      const res = await fetch('https://api.opendota.com/api/heroes');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      for (const h of list) {
        heroData[h.id] = { name: h.localized_name, slug: h.name.replace('npc_dota_hero_', '') };
      }
      console.log(`Loaded ${Object.keys(heroData).length} heroes.`);
    });
  } catch (err) {
    console.warn('Could not load hero names after retries:', err.message);
  }
}

async function fetchItemNames() {
  try {
    await withRetry(async () => {
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
    });
  } catch (err) {
    console.warn('Could not load item names after retries:', err.message);
  }
}

function heroName(id) { return heroData[id]?.name || `Hero #${id}`; }

function heroImageUrl(id) {
  const slug = heroData[id]?.slug;
  if (!slug) return null;
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;
}

module.exports = { heroData, itemData, fetchHeroNames, fetchItemNames, heroName, heroImageUrl };
