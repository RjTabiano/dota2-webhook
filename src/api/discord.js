'use strict';

const { DISCORD_WEBHOOK_URL } = require('../config');
const { sleep }               = require('../utils');

async function sendEmbed(embed, content = '') {
  const body = { embeds: [embed] };
  if (content) body.content = content;
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Discord ${res.status}: ${text}`);
  }
  await sleep(300);
}

async function sendEmbedWithThumb(embed, thumbBuffer, content = '') {
  embed.thumbnail = { url: 'attachment://thumb.png' };
  const form    = new FormData();
  const payload = { embeds: [embed] };
  if (content) payload.content = content;
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([thumbBuffer], { type: 'image/png' }), 'thumb.png');
  const res = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`Discord ${res.status}: ${text}`);
  }
  await sleep(300);
}

module.exports = { sendEmbed, sendEmbedWithThumb };
