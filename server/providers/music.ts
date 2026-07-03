import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import type { WorkflowInput } from '../types.js';

async function writePlaceholderMp3(targetPath: string) {
  const bytes = Buffer.from('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000', 'binary');
  await fs.writeFile(targetPath, bytes);
}

export async function generateMusic(input: WorkflowInput, lyrics: string, targetPath: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    await writePlaceholderMp3(targetPath);
    return { path: targetPath, note: '未配置 MINIMAX_API_KEY，已生成占位MP3；配置后会调用 MiniMax music-2.6-free。' };
  }

  const form = new FormData();
  form.append('model', process.env.MINIMAX_MUSIC_MODEL ?? 'music-2.6-free');
  form.append('title', input.title);
  form.append('lyrics', lyrics);
  form.append('genre', input.genre);
  form.append('mood', input.mood);
  form.append('duration', String(input.duration));
  if (input.referenceAudioPath) {
    form.append('reference_audio', await fs.readFile(input.referenceAudioPath), path.basename(input.referenceAudioPath));
  }

  const url = `${process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.chat/v1'}/music_generation`;
  const response = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${apiKey}`,
      ...(process.env.MINIMAX_GROUP_ID ? { 'X-Group-Id': process.env.MINIMAX_GROUP_ID } : {})
    },
    timeout: 300000,
    responseType: 'arraybuffer',
    validateStatus: (status) => status < 500
  });

  if (response.status >= 400) {
    throw new Error(`MiniMax生成失败：HTTP ${response.status} ${Buffer.from(response.data).toString('utf8').slice(0, 300)}`);
  }

  const contentType = String(response.headers['content-type'] ?? '');
  if (contentType.includes('application/json')) {
    const json = JSON.parse(Buffer.from(response.data).toString('utf8'));
    const audioUrl = json.audio_url ?? json.data?.audio_url ?? json.data?.url;
    if (!audioUrl) throw new Error(`MiniMax返回中没有音频地址：${JSON.stringify(json).slice(0, 300)}`);
    const audio = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 300000 });
    await fs.writeFile(targetPath, Buffer.from(audio.data));
  } else {
    await fs.writeFile(targetPath, Buffer.from(response.data));
  }
  return { path: targetPath };
}
