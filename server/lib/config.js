import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { rootDir } from './paths.js';

const configDir = path.join(rootDir, 'config');
const configPath = path.join(configDir, 'runtime-config.json');

const defaults = {
  deepseekBaseUrl: 'https://api.deepseek.com/v1',
  deepseekModel: 'deepseek-chat',
  minimaxBaseUrl: 'https://api.minimaxi.com/v1',
  minimaxMusicModel: 'music-2.6-free',
  minimaxGroupId: '',
  agnesBaseUrl: 'https://apihub.agnes-ai.com/v1',
  agnesImageModel: 'agnes-image-2.1-flash',
  tomatoPublishUrl: '',
  tomatoAccessToken: ''
};

const secretFields = new Set(['deepseekApiKey', 'minimaxApiKey', 'agnesApiKey', 'tomatoAccessToken']);

function fromEnv() {
  return {
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || defaults.deepseekBaseUrl,
    deepseekModel: process.env.DEEPSEEK_MODEL || defaults.deepseekModel,
    minimaxApiKey: process.env.MINIMAX_API_KEY || '',
    minimaxBaseUrl: process.env.MINIMAX_BASE_URL || defaults.minimaxBaseUrl,
    minimaxMusicModel: process.env.MINIMAX_MUSIC_MODEL || defaults.minimaxMusicModel,
    minimaxGroupId: process.env.MINIMAX_GROUP_ID || '',
    agnesApiKey: process.env.AGNES_API_KEY || '',
    agnesBaseUrl: process.env.AGNES_BASE_URL || defaults.agnesBaseUrl,
    agnesImageModel: process.env.AGNES_MODEL || defaults.agnesImageModel,
    tomatoPublishUrl: process.env.TOMATO_PUBLISH_URL || '',
    tomatoAccessToken: process.env.TOMATO_ACCESS_TOKEN || ''
  };
}

async function readSaved() {
  try {
    return JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

export async function getRuntimeConfig() {
  return { ...defaults, ...fromEnv(), ...(await readSaved()) };
}

export function maskSecret(value) {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 10) return `${text.slice(0, 2)}****${text.slice(-2)}`;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function publicConfig(config) {
  const output = { ...config };
  for (const field of secretFields) {
    output[field] = undefined;
    output[`${field}Masked`] = maskSecret(config[field]);
    output[`${field}Configured`] = Boolean(config[field]);
  }
  return output;
}

export async function saveRuntimeConfig(input) {
  const current = await getRuntimeConfig();
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!(key in current) && !secretFields.has(key)) continue;
    if (secretFields.has(key) && value === '') continue;
    next[key] = typeof value === 'string' ? value.trim() : value;
  }
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function diagnoseRuntimeConfig(options = {}) {
  const config = await getRuntimeConfig();
  const results = {};
  const currentOnly = options.currentOnly === true;

  async function probe(name, fn) {
    try {
      const response = await fn();
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      results[name] = {
        ok: response.status >= 200 && response.status < 400,
        status: response.status,
        message: body.slice(0, 500)
      };
    } catch (error) {
      results[name] = {
        ok: false,
        status: error.response?.status || 0,
        message: (error.response?.data ? JSON.stringify(error.response.data) : error.message).slice(0, 500)
      };
    }
  }

  if (currentOnly) {
    await probe('selectedModel', () => axios.post(
      `${config.deepseekBaseUrl}/chat/completions`,
      {
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: '你只需要回复一个字：ok' },
          { role: 'user', content: 'ping' }
        ],
        temperature: 0,
        max_tokens: 5
      },
      {
        headers: {
          Authorization: `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        validateStatus: () => true
      }
    ));
    return { config: publicConfig(config), results };
  }

  await probe('deepseekChat', () => axios.post(
...[Truncated]...
  await probe('minimaxMusicModel', () => axios.post(`${config.minimaxBaseUrl}/music_generation`, {
    model: config.minimaxMusicModel,
    lyrics: '[Verse 1]\ntest',
    title: 'test',
    genre: 'pop',
    mood: 'calm',
    duration: 120
  }, {
    headers: {
      Authorization: `Bearer ${config.minimaxApiKey}`,
      'Content-Type': 'application/json',
      ...(config.minimaxGroupId ? { 'Group-Id': config.minimaxGroupId } : {})
    },
    timeout: 30000,
    validateStatus: () => true
  }));

  return { config: publicConfig(config), results };
}


