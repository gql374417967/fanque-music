import axios from 'axios';
import { getRuntimeConfig } from '../lib/config.js';
import { stripBracketNoise, ensureSongSections } from '../lib/text.js';

function cleanTitle(text) {
  return String(text || '')
    .replace(/[《》"“”'`]/g, '')
    .replace(/^(歌名|标题|名称)[:：\s]*/i, '')
    .split(/[\r\n]/)[0]
    .trim()
    .slice(0, 24);
}

function fallbackTitle(input) {
  const theme = String(input.theme || '').replace(/[，。,.、；;：:\s]/g, '');
  const mood = String(input.mood || '').split(/[，,、/\s]/).find(Boolean) || '心事';
  if (theme.includes('夜') || theme.includes('都市')) return '夜色有回音';
  if (theme.includes('告别') || theme.includes('离开')) return '风把告别唱完';
  if (theme.includes('重新') || theme.includes('出发')) return '下一站天亮';
  return `${mood.slice(0, 4)}的歌`;
}

function cleanTheme(text) {
  return String(text || '')
    .replace(/^(主题|歌曲主题|创作主题)[:：\s]*/i, '')
    .replace(/[《》"“”'`]/g, '')
    .split(/[\r\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('，')
    .slice(0, 120);
}

function isUsableTheme(text) {
  return cleanTheme(text).length >= 20;
}

function fallbackTheme(input) {
  const title = cleanTitle(input.title);
  const genre = String(input.genre || '华语流行').trim();
  const mood = String(input.mood || '温柔、坚定').trim();
  const titlePart = title ? `围绕《${title}》` : '围绕都市生活中的一次自我和解';
  return `${titlePart}，${mood}的情绪，${genre}质感，写出告别旧日、重新出发的故事，适合写实人物音乐封面。`;
}

export async function generateTheme(input) {
  const existing = cleanTheme(input.theme);
  if (isUsableTheme(existing)) return existing;
  const config = await getRuntimeConfig();
  const apiKey = config.deepseekApiKey;
  if (!apiKey) return fallbackTheme(input);

  const prompt = `请为一首中文歌曲生成1段创作主题。歌名：${input.title || '待定'}。曲风：${input.genre}。情绪：${input.mood}。要求：只输出主题本身，40到80个汉字，能同时指导歌词和写实人物专辑封面，不要解释。`;
  try {
    const response = await axios.post(
      `${config.deepseekBaseUrl}/chat/completions`,
      {
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: '你是专业中文流行音乐企划，只输出一段创作主题。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 160
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 }
    );
    const generated = cleanTheme(response.data?.choices?.[0]?.message?.content);
    return isUsableTheme(generated) ? generated : fallbackTheme(input);
  } catch {
    return fallbackTheme(input);
  }
}

export async function generateTitle(input) {
  const existing = cleanTitle(input.title);
  if (existing) return existing;
  const config = await getRuntimeConfig();
  const apiKey = config.deepseekApiKey;
  if (!apiKey) return fallbackTitle(input);

  const prompt = `请为一首中文歌曲生成1个歌名。主题：${input.theme}。曲风：${input.genre}。情绪：${input.mood}。要求：只输出歌名本身，不要书名号，不要解释，2到8个汉字，适合番茄音乐平台。`;
  try {
    const response = await axios.post(
      `${config.deepseekBaseUrl}/chat/completions`,
      {
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: '你是专业中文流行音乐企划，只输出一个简短歌名。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.85,
        max_tokens: 40
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60000 }
    );
    return cleanTitle(response.data?.choices?.[0]?.message?.content) || fallbackTitle(input);
  } catch {
    return fallbackTitle(input);
  }
}

function pickWords(input) {
  const theme = String(input.theme || '新的故事');
  const title = String(input.title || '未命名的歌');
  const mood = String(input.mood || '温柔');
  const genre = String(input.genre || '流行');
  const tokens = theme
    .split(/[，。,.、；;：:\s/]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return {
    title,
    mood: mood.split(/[，,、/\s]+/).find(Boolean) || '温柔',
    genre: genre.split(/[，,、/\s]+/).find(Boolean) || '流行',
    scene: tokens[0] || title,
    turn: tokens[1] || '风经过的路口',
    promise: tokens[2] || '重新出发',
    image: tokens[3] || '心里的光'
  };
}

function fallbackLyrics(input) {
  const words = pickWords(input);
  return ensureSongSections(stripBracketNoise(`[Intro]
${words.title}
${words.scene}，${words.mood}地亮起

[Verse 1]
我走进${words.scene}的风里
把没说完的话留给潮汐
${words.turn}在远处慢慢清晰
像一段${words.genre}旋律靠近心底

[Pre-Chorus]
如果昨天还在掌心下雨
我就把沉默折成新的勇气

[Chorus]
${words.title}，唱给此刻的自己
把${words.image}点亮在夜里
就算世界忽远又忽近
我也朝着${words.promise}走去

[Verse 2]
人群经过熟悉的街景
每个脚步都有新的回音
我把遗憾写成一封信
寄给未来更坦然的眼睛

[Bridge]
让风替我翻过旧页
让梦回答所有长夜

[Outro]
${words.title}，终于听清
原来${words.promise}就是最好的约定`));
}

export async function generateLyrics(input) {
  const config = await getRuntimeConfig();
  const apiKey = config.deepseekApiKey;
  if (!apiKey) return fallbackLyrics(input);

  const prompt = `请生成一首${input.genre}中文歌词，时长${input.duration}秒，情绪${input.mood}，主题：${input.theme}。要求：只输出歌词；包含[Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Bridge] [Outro]段落标记；不要括号说明；适合音乐生成模型。`;
  const response = await axios.post(
    `${config.deepseekBaseUrl}/chat/completions`,
    {
      model: config.deepseekModel,
      messages: [
        { role: 'system', content: '你是专业中文流行音乐作词人，只输出歌词正文。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 1800
    },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 180000 }
  );
  const text = response.data?.choices?.[0]?.message?.content ?? '';
  return ensureSongSections(stripBracketNoise(text));
}
