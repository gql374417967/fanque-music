import axios from 'axios';
import sharp from 'sharp';
import { getRuntimeConfig } from '../lib/config.js';

function escapeXml(text) {
  return String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

async function createFallbackCover(input, targetPath) {
  const title = escapeXml(input.title);
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#14532d"/><stop offset="0.55" stop-color="#1d4ed8"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/><circle cx="512" cy="360" r="158" fill="#f2c6a0"/><path d="M250 900c34-205 167-312 262-312s228 107 262 312" fill="#1f2937"/><text x="512" y="930" fill="white" font-size="64" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif">${title}</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(targetPath);
}

export async function generateCover(input, targetPath) {
  const config = await getRuntimeConfig();
  const apiKey = config.agnesApiKey;
  if (!apiKey) {
    await createFallbackCover(input, targetPath);
    return { path: targetPath, skipped: true, reason: '未配置 AGNES_API_KEY，已生成本地封面。' };
  }

  try {
    const prompt = `写实人物音乐封面，中文流行歌曲《${input.title}》，${input.theme}，${input.mood}，电影感布光，真实人像，专业专辑封面，干净构图，无文字`;
    const response = await axios.post(
      `${config.agnesBaseUrl}/images/generations`,
      { model: config.agnesImageModel, prompt, size: '1024x1024', n: 1 },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 300000, validateStatus: (status) => status < 500 }
    );
    if (response.status >= 400) throw new Error(`Agnes封面生成失败：HTTP ${response.status} ${JSON.stringify(response.data).slice(0, 300)}`);

    const item = response.data?.data?.[0] ?? response.data;
    const imageUrl = item?.url || item?.image_url;
    const b64 = item?.b64_json || item?.base64;
    if (imageUrl) {
      const image = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 300000 });
      await sharp(Buffer.from(image.data)).resize(1024, 1024, { fit: 'cover' }).png().toFile(targetPath);
    } else if (b64) {
      await sharp(Buffer.from(b64, 'base64')).resize(1024, 1024, { fit: 'cover' }).png().toFile(targetPath);
    } else {
      throw new Error(`Agnes返回中没有图片：${JSON.stringify(response.data).slice(0, 300)}`);
    }
    return { path: targetPath };
  } catch (error) {
    await createFallbackCover(input, targetPath);
    const reason = error instanceof Error ? error.message : String(error);
    return { path: targetPath, fallback: true, reason: `Agnes不可用，已生成本地封面：${reason}` };
  }
}

export async function postProcessCover(input, sourcePath, targetPath) {
  const safeTitle = escapeXml(input.title);
  const overlay = `<svg width="1440" height="1440" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(0,0,0,0)"/><stop offset="0.55" stop-color="rgba(0,0,0,.55)"/><stop offset="1" stop-color="rgba(0,0,0,.82)"/></linearGradient></defs><rect y="1040" width="1440" height="400" fill="url(#fade)"/><text x="720" y="1310" fill="white" font-size="92" font-weight="700" text-anchor="middle" font-family="Arial, Microsoft YaHei, sans-serif">${safeTitle}</text></svg>`;
  await sharp(sourcePath).resize(1440, 1440, { fit: 'cover' }).composite([{ input: Buffer.from(overlay), top: 0, left: 0 }]).png().toFile(targetPath);
  return targetPath;
}
