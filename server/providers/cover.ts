import fs from 'node:fs/promises';
import axios from 'axios';
import sharp from 'sharp';
import type { WorkflowInput } from '../types.js';

async function createFallbackCover(input: WorkflowInput, targetPath: string) {
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#14532d"/><stop offset="0.55" stop-color="#334155"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="512" cy="360" r="150" fill="#f5d0c5"/><path d="M260 900c42-210 150-320 252-320s210 110 252 320" fill="#111827"/><text x="512" y="860" fill="#fff" font-size="56" text-anchor="middle" font-family="Arial">${input.title}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(targetPath);
}

export async function generateCover(input: WorkflowInput, targetPath: string) {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey || apiKey === 'replace_me') {
    await createFallbackCover(input, targetPath);
    return { path: targetPath, note: '未配置 AGNES_API_KEY，已生成本地封面占位图。' };
  }

  const prompt = `写实人物音乐专辑封面，中文流行音乐，主题：${input.theme}，情绪：${input.mood}，风格：${input.genre}，电影感人像，真实摄影质感，1024x1024，无文字，无logo`;
  const baseUrl = process.env.AGNES_BASE_URL ?? 'https://apihub.agnes-ai.com/v1';
  const response = await axios.post(
    `${baseUrl}/images/generations`,
    { model: process.env.AGNES_MODEL ?? 'agnes', prompt, size: '1024x1024', n: 1, response_format: 'b64_json' },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 240000, validateStatus: (status) => status < 500 }
  );
  if (response.status >= 400) throw new Error(`Agnes封面生成失败：HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 300)}`);
  const item = response.data?.data?.[0];
  if (item?.b64_json) {
    await fs.writeFile(targetPath, Buffer.from(item.b64_json, 'base64'));
  } else if (item?.url) {
    const image = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 240000 });
    await fs.writeFile(targetPath, Buffer.from(image.data));
  } else {
    throw new Error(`Agnes返回中没有图片：${JSON.stringify(response.data).slice(0, 300)}`);
  }
  return { path: targetPath };
}

export async function postProcessCover(sourcePath: string, targetPath: string, title: string) {
  const safeTitle = title.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
  const overlay = `<svg width="1440" height="1440" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="0.72"/></linearGradient></defs><rect x="0" y="1040" width="1440" height="400" fill="url(#fade)"/><text x="720" y="1310" fill="white" font-size="92" font-weight="700" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif">${safeTitle}</text></svg>`;
  await sharp(sourcePath)
    .resize(1440, 1440, { fit: 'cover' })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toFile(targetPath);
  return targetPath;
}
