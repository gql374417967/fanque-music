import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import axios from 'axios';
import FormData from 'form-data';
import { getRuntimeConfig } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');

export async function createPackage(input, audioPath, coverPath, lyrics, targetZip) {
  await fs.mkdir(path.dirname(targetZip), { recursive: true });
  const handle = await fs.open(targetZip, 'w');
  return new Promise((resolve, reject) => {
    const stream = handle.createWriteStream();
    const archive = new ZipArchive({ zlib: { level: 9 } });
    let settled = false;
    const fail = async (error) => {
      if (settled) return;
      settled = true;
      await handle.close().catch(() => {});
      reject(error);
    };
    stream.on('close', async () => {
      if (settled) return;
      settled = true;
      await handle.close().catch(() => {});
      resolve(targetZip);
    });
    archive.on('error', fail);
    archive.pipe(stream);
    archive.file(audioPath, { name: `${input.title}.mp3` });
    archive.file(coverPath, { name: `${input.title}.png` });
    archive.append(lyrics, { name: `${input.title}.lyrics.txt` });
    archive.append(JSON.stringify({ title: input.title, artist: input.artist, genre: input.genre, mood: input.mood, duration: input.duration }, null, 2), { name: 'metadata.json' });
    archive.finalize().catch(fail);
  });
}

export async function publishToTomato(input, audioPath, coverPath, lyrics) {
  const config = await getRuntimeConfig();
  const url = config.tomatoPublishUrl;
  const token = config.tomatoAccessToken;
  if (!url || !token) return { skipped: true, reason: '未配置番茄音乐发布接口，已生成可手动上传的发布包。' };

  const form = new FormData();
  form.append('title', input.title);
  form.append('artist', input.artist);
  form.append('genre', input.genre);
  form.append('mood', input.mood);
  form.append('lyrics', lyrics);
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
