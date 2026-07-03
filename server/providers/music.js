import fs from 'node:fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { getRuntimeConfig } from '../lib/config.js';

async function writePlaceholderMp3(targetPath) {
  const bytes = Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'binary');
  await fs.writeFile(targetPath, bytes);
}

function findAudioUrl(value) {
  if (!value || typeof value !== 'object') return '';
  const preferredKeys = ['audio_url', 'audioUrl', 'url', 'file_url', 'download_url', 'song_url', 'audio_file_url', 'music_url', 'play_url'];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findAudioUrl(child);
        if (found) return found;
      }
    } else if (item && typeof item === 'object') {
      const found = findAudioUrl(item);
      if (found) return found;
    }
  }
  return '';
}

function looksLikeHexAudio(text) {
  const compact = text.replace(/\s+/g, '');
  return compact.length > 128 && compact.length % 2 === 0 && /^[0-9a-f]+$/i.test(compact);
}

function findHexAudio(value) {
  if (!value || typeof value !== 'object') return '';
  const preferredKeys = ['audio', 'hex_audio', 'audio_hex', 'audio_data', 'data'];
  for (const key of preferredKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && looksLikeHexAudio(candidate)) return candidate;
  }
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findHexAudio(child);
        if (found) return found;
      }
    } else if (item && typeof item === 'object') {
      const found = findHexAudio(item);
      if (found) return found;
    } else if (typeof item === 'string' && looksLikeHexAudio(item)) {
      return item;
    }
  }
  return '';
}

async function writeHexAudio(targetPath, hexText) {
  await fs.writeFile(targetPath, Buffer.from(hexText.replace(/\s+/g, ''), 'hex'));
}

export async function generateMusic(input, lyrics, targetPath) {
  const config = await getRuntimeConfig();
  const apiKey = config.minimaxApiKey;
  if (!apiKey) {
    await writePlaceholderMp3(targetPath);
    return { path: targetPath, skipped: true, reason: '未配置 MINIMAX_API_KEY，已生成占位 MP3。' };
  }

  const form = new FormData();
  form.append('model', config.minimaxMusicModel);
  form.append('lyrics', lyrics);
  form.append('title', input.title);
  form.append('genre', input.genre);
  form.append('mood', input.mood);
  form.append('duration', String(input.duration));
  if (input.referenceAudioPath) form.append('reference_audio', await fs.readFile(input.referenceAudioPath), 'reference_audio.mp3');

  const headers = { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` };
  if (config.minimaxGroupId) headers['Group-Id'] = config.minimaxGroupId;

  const response = await axios.post(`${config.minimaxBaseUrl}/music_generation`, form, {
    headers,
    responseType: 'arraybuffer',
    timeout: 300000,
    validateStatus: (status) => status < 500
  });
  if (response.status >= 400) throw new Error(`MiniMax音乐生成失败：HTTP ${response.status} ${Buffer.from(response.data).toString('utf8').slice(0, 300)}`);

  const contentType = String(response.headers['content-type'] || '');
  const responseText = Buffer.from(response.data).toString('utf8').trim();
  let sourceUrl = '';

  if (contentType.includes('application/json') || responseText.startsWith('{')) {
    const json = JSON.parse(responseText);
    sourceUrl = findAudioUrl(json);
    if (sourceUrl) {
      const audio = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 300000 });
      await fs.writeFile(targetPath, Buffer.from(audio.data));
    } else {
      const hexAudio = findHexAudio(json);
      if (!hexAudio) throw new Error(`MiniMax返回中没有可用音频URL或hex音频数据：${JSON.stringify(json).slice(0, 500)}`);
      await writeHexAudio(targetPath, hexAudio);
      return { path: targetPath, sourceUrl: '', sourceType: 'hex' };
    }
  } else if (/^https?:\/\//i.test(responseText)) {
    sourceUrl = responseText;
    const audio = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 300000 });
    await fs.writeFile(targetPath, Buffer.from(audio.data));
  } else if (looksLikeHexAudio(responseText)) {
    await fs.writeFile(targetPath, Buffer.from(responseText.replace(/\s+/g, ''), 'hex'));
    return { path: targetPath, sourceUrl: '', sourceType: 'hex' };
  } else {
    throw new Error(`MiniMax返回中没有可用音频URL或hex音频数据：${responseText.slice(0, 500)}`);
  }
  return { path: targetPath, sourceUrl, sourceType: sourceUrl ? 'url' : 'binary' };
}
