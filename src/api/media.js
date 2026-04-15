'use strict';

const { GIPHY_API_KEY } = require('../config');

const GIPHY_QUERIES = {
  godlike: 'gaming domination win', good:    'gg easy win gaming',
  average: 'barely made it gaming', boosted: 'lucky win gaming',
  int:     'this is fine fire meme', bad:    'skill issue gaming fail',
  unlucky: 'useless teammates meme', party:  'squad win celebration',
};

const TENOR_IDS = {
  oneMoreDay: '1139253898020084735',
  sadWolf:    '12680331970011864304',
};

async function fetchTenorGif(id) {
  try {
    const res  = await fetch(`https://api.tenor.com/v1/gifs?ids=${id}&key=LIVDSRZULELA&media_filter=minimal`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.media?.[0]?.tinygif?.url
        || data.results?.[0]?.media?.[0]?.gif?.url
        || null;
  } catch { return null; }
}

const fetchOneMoreDayGif = () => fetchTenorGif(TENOR_IDS.oneMoreDay);
const fetchSadWolfGif    = () => fetchTenorGif(TENOR_IDS.sadWolf);

async function fetchGif(tier) {
  if (!GIPHY_API_KEY) return null;
  try {
    const q      = encodeURIComponent(GIPHY_QUERIES[tier] || 'gaming');
    const offset = Math.floor(Math.random() * 50);
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

function fetchMedia(tier) {
  return Math.random() < 0.5 ? fetchGif(tier) : fetchMeme();
}

module.exports = { fetchMedia, fetchOneMoreDayGif, fetchSadWolfGif };
