import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import archiver from 'archiver';
import type { WorkflowInput } from '../types.js';

export async function createPackage(input: WorkflowInput, audioPath: string, coverPath: string, lyrics: string, targetZip: string) {
  await fs.mkdir(path.dirname(targetZip), { recursive: true });
  const output = await fs.open(targetZip, 'w');
  const stream = output.createWriteStream();
  const archive = archiver('zip', { zlib: { level: 9 } });
  const done = new Promise<void>((resolve, reject) => {
    stream.on('close', resolve);
    archive.on('error', reject);
  });
  archive.pipe(stream);
  archive.file(audioPath, { name: `${input.title}.mp3` });
  archive.file(coverPath, { name: `${input.title}.png` });
  archive.append(lyrics, { name: `${input.title}.lrc.txt` });
  archive.append(JSON.stringify({ title: input.title, artist: input.artist, genre: input.genre, mood: input.mood, theme: input.theme }, null, 2), { name: 'metadata.json' });
  await archive.finalize();
  await done;
  await output.close();
  return targetZip;
}

export async function publishToTomato(input: WorkflowInput, audioPath: string, coverPath: string, lyrics: string) {
  if (input.publishMode === 'package') {
    return { skipped: true, message: '已选择仅生成发布包。' };
  }
  const url = process.env.TOMATO_PUBLISH_URL;
  const token = process.env.TOMATO_ACCESS_TOKEN;
  if (!url || !token) {
    return { skipped: true, message: '未配置番茄音乐开放发布接口，已生成可手动上传的MP3+PNG发布包。' };
  }

  const form = new FormData();
  form.append('title', input.title);
  form.append('artist', input.artist);
  form.append('genre', input.genre);
  form.append('lyrics', lyrics);
  form.append('mode', input.publishMode);
  form.append('audio', await fs.readFile(audioPath), `${input.title}.mp3`);
  form.append('cover', await fs.readFile(coverPath), `${input.title}.png`);

  const response = await axios.post(url, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
    timeout: 300000,
    validateStatus: (status) => status < 500
  });
  if (response.status >= 400) throw new Error(`番茄发布失败：HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 300)}`);
  return response.data;
}
