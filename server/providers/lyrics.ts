import axios from 'axios';
import { stripBracketNoise, ensureSongSections } from '../lib/text.js';
import type { WorkflowInput } from '../types.js';

export async function generateLyrics(input: WorkflowInput) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return ensureSongSections(stripBracketNoise(`[Intro]\n${input.theme}\n\n[Verse 1]\n霓虹落在未醒的窗台\n我把心事调成慢半拍\n人海尽头你的名字亮起来\n像风穿过旧街招牌\n\n[Chorus]\n让这一首歌替我奔向你\n在${input.mood}里保持清醒\n若世界喧哗盖过了约定\n我仍听见你给的回音\n\n[Verse 2]\n时间把遗憾折进了口袋\n我们学会温柔地释怀\n下一站若还有星光盛开\n就把孤单唱成未来\n\n[Bridge]\n鼓点推开心里的潮汐\n每次呼吸都靠近黎明\n\n[Outro]\n把梦交给夜色和旋律`));
  }

  const prompt = `为中文流行歌曲生成完整歌词。歌名：${input.title}；艺人：${input.artist}；主题：${input.theme}；风格：${input.genre}；情绪：${input.mood}；目标时长：${input.duration}秒。要求：适合2.5-3分钟演唱，必须包含[Intro] [Verse 1] [Chorus] [Verse 2] [Bridge] [Outro]等段落标记；不要解释，不要括号备注，不要和弦。`;
  const response = await axios.post(
    `${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'}/chat/completions`,
    {
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
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
