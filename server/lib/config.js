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
const providerFields = {
  deepseek: ['deepseekApiKey', 'deepseekBaseUrl', 'deepseekModel'],
  minimax: ['minimaxApiKey', 'minimaxBaseUrl', 'minimaxMusicModel', 'minimaxGroupId'],
  agnes: ['agnesApiKey', 'agnesBaseUrl', 'agnesImageModel'],
  tomato: ['tomatoPublishUrl', 'tomatoAccessToken']
};

function emptyProfile(name, provider = 'custom') {
  return { name, provider, ...defaults, deepseekApiKey: '', minimaxApiKey: '', agnesApiKey: '', tomatoAccessToken: '' };
}

function normalizeProfiles(raw) {
  const base = {
    version: 1,
    activeProfile: 'default',
    profiles: { default: emptyProfile('default') }
  };
  if (!raw || typeof raw !== 'object') return base;
  if (raw.profiles && typeof raw.profiles === 'object') {
    const next = { ...base, ...raw, profiles: {} };
    for (const [name, profile] of Object.entries(raw.profiles)) {
      next.profiles[name] = { ...emptyProfile(name, profile?.provider || 'custom'), ...profile, name };
    }
    if (!next.profiles[next.activeProfile]) next.activeProfile = Object.keys(next.profiles)[0] || 'default';
    return next;
  }
  const legacy = { ...emptyProfile('default'), ...raw, name: 'default' };
  return { version: 1, activeProfile: 'default', profiles: { default: legacy } };
}

function pickProfile(configState, profileName) {
  const profiles = configState.profiles || {};
  const names = Object.keys(profiles);
  const activeName = profileName && profiles[profileName] ? profileName : configState.activeProfile;
  return profiles[activeName] || profiles[names[0]] || emptyProfile('default');
}

async function readSaved() {
  try {
    return normalizeProfiles(JSON.parse(await fs.readFile(configPath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return normalizeProfiles();
    throw error;
  }
}

function mergeEnv(profile) {
  return {
    ...profile,
    deepseekApiKey: profile.deepseekApiKey || process.env.DEEPSEEK_API_KEY || '',
    deepseekBaseUrl: profile.deepseekBaseUrl || process.env.DEEPSEEK_BASE_URL || defaults.deepseekBaseUrl,
    deepseekModel: profile.deepseekModel || process.env.DEEPSEEK_MODEL || defaults.deepseekModel,
    minimaxApiKey: profile.minimaxApiKey || process.env.MINIMAX_API_KEY || '',
    minimaxBaseUrl: profile.minimaxBaseUrl || process.env.MINIMAX_BASE_URL || defaults.minimaxBaseUrl,
    minimaxMusicModel: profile.minimaxMusicModel || process.env.MINIMAX_MUSIC_MODEL || defaults.minimaxMusicModel,
    minimaxGroupId: profile.minimaxGroupId || process.env.MINIMAX_GROUP_ID || '',
    agnesApiKey: profile.agnesApiKey || process.env.AGNES_API_KEY || '',
    agnesBaseUrl: profile.agnesBaseUrl || process.env.AGNES_BASE_URL || defaults.agnesBaseUrl,
    agnesImageModel: profile.agnesImageModel || process.env.AGNES_MODEL || defaults.agnesImageModel,
    tomatoPublishUrl: profile.tomatoPublishUrl || process.env.TOMATO_PUBLISH_URL || '',
    tomatoAccessToken: profile.tomatoAccessToken || process.env.TOMATO_ACCESS_TOKEN || ''
  };
}

export async function getRuntimeConfig(options = {}) {
  const saved = await readSaved();
  const profileName = options.profile || saved.activeProfile;
  return mergeEnv(pickProfile(saved, profileName));
}

export async function getRuntimeConfigState() {
  return readSaved();
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
  const state = await readSaved();
  const profileName = (input.profileName || state.activeProfile || 'default').trim() || 'default';
  const current = { ...emptyProfile(profileName), ...(state.profiles[profileName] || {}) };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'profileName' || key === 'activeProfile') continue;
    if (!(key in current) && !secretFields.has(key)) continue;
    if (secretFields.has(key) && value === '') continue;
    current[key] = typeof value === 'string' ? value.trim() : value;
  }
  current.name = profileName;
  state.profiles[profileName] = current;
  state.activeProfile = input.activeProfile || profileName;
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return publicConfig(current);
}

export async function listRuntimeProfiles() {
  const state = await readSaved();
  return {
    activeProfile: state.activeProfile,
    profiles: Object.values(state.profiles).map((profile) => publicConfig(profile))
  };
}

export async function createRuntimeProfile(name, template = {}) {
  const state = await readSaved();
  const profileName = String(name || '').trim();
  if (!profileName) throw new Error('配置名称不能为空');
  if (state.profiles[profileName]) throw new Error('配置名称已存在');
  state.profiles[profileName] = { ...emptyProfile(profileName, template.provider || 'custom'), ...template, name: profileName };
  state.activeProfile = profileName;
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state.profiles[profileName];
}

export async function deleteRuntimeProfile(name) {
  const state = await readSaved();
  if (name === 'default') throw new Error('默认配置不可删除');
  delete state.profiles[name];
  if (!Object.keys(state.profiles).length) state.profiles.default = emptyProfile('default');
  if (state.activeProfile === name) state.activeProfile = Object.keys(state.profiles)[0];
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

export async function diagnoseRuntimeConfig(options = {}) {
  const config = await getRuntimeConfig({ profile: options.profile });
  const results = {};
  const currentOnly = options.currentOnly === true;

  async function probe(name, metadata, fn) {
    const context = { provider: metadata.provider, model: metadata.model, endpoint: metadata.endpoint, label: metadata.label };
    try {
      const response = await fn();
      const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      results[name] = { ...context, ok: response.status >= 200 && response.status < 400, status: response.status, message: body.slice(0, 500) };
    } catch (error) {
      results[name] = { ...context, ok: false, status: error.response?.status || 0, message: (error.response?.data ? JSON.stringify(error.response.data) : error.message).slice(0, 500) };
    }
  }

  const deepseekEndpoint = `${config.deepseekBaseUrl}/chat/completions`;
  const minimaxEndpoint = `${config.minimaxBaseUrl}/music_generation`;
  const agnesEndpoint = `${config.agnesBaseUrl}/images/generations`;
  const deepseekRequest = () => axios.post(deepseekEndpoint, { model: config.deepseekModel, messages: [{ role: 'system', content: '你只需要回复一个字：ok' }, { role: 'user', content: 'ping' }], temperature: 0, max_tokens: 5 }, { headers: { Authorization: `Bearer ${config.deepseekApiKey}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true });

  if (currentOnly) {
    await probe('selectedModel', { provider: 'deepseek', model: config.deepseekModel, endpoint: deepseekEndpoint, label: '当前文本模型（DeepSeek）' }, deepseekRequest);
    return { config: publicConfig(config), results };
  }

  await probe('deepseekChat', { provider: 'deepseek', model: config.deepseekModel, endpoint: deepseekEndpoint, label: '歌词文本模型（DeepSeek）' }, deepseekRequest);
  await probe('minimaxMusicModel', { provider: 'minimax', model: config.minimaxMusicModel, endpoint: minimaxEndpoint, label: '音乐生成模型（MiniMax）' }, () => axios.post(minimaxEndpoint, { model: config.minimaxMusicModel, lyrics: '[Verse 1]\ntest', title: 'test', genre: 'pop', mood: 'calm', duration: 120 }, { headers: { Authorization: `Bearer ${config.minimaxApiKey}`, 'Content-Type': 'application/json', ...(config.minimaxGroupId ? { 'Group-Id': config.minimaxGroupId } : {}) }, timeout: 30000, validateStatus: () => true }));
  await probe('agnesImageModel', { provider: 'agnes', model: config.agnesImageModel, endpoint: agnesEndpoint, label: '封面生成模型（Agnes）' }, () => axios.post(agnesEndpoint, { model: config.agnesImageModel, prompt: 'minimal red circle icon on white background', size: '1024x1024', n: 1 }, { headers: { Authorization: `Bearer ${config.agnesApiKey}`, 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }));
  return { config: publicConfig(config), results };
}
