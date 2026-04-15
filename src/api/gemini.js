'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY }     = require('../config');
const { soloPrompt, partyPrompt } = require('./prompt');

const TIMEOUT_MS = 12000;
const MODEL      = 'gemini-3-flash-preview';

let model = null;
function getModel() {
  if (!GEMINI_API_KEY) return null;
  if (!model) model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({ model: MODEL });
  return model;
}

function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}

async function ask(prompt) {
  const m = getModel();
  if (!m) return null;
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gemini timeout')), TIMEOUT_MS)
  );
  const result = await Promise.race([m.generateContent(prompt), timeout]);
  return result.response.text().trim();
}

async function generateSolo(ctx) {
  try {
    const text = await ask(soloPrompt(ctx));
    if (!text) return {};
    return parseJson(text);
  } catch (err) {
    console.warn('  Gemini solo failed:', err.message);
    return {};
  }
}

async function generateParty(ctx) {
  try {
    const text = await ask(partyPrompt(ctx));
    if (!text) return {};
    return parseJson(text);
  } catch (err) {
    console.warn('  Gemini party failed:', err.message);
    return {};
  }
}

module.exports = { generateSolo, generateParty };
