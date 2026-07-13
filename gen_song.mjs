import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { generateMusic } from './server/providers/music.js';
import { generateCover, postProcessCover } from './server/providers/cover.js';
import { createPackage } from './server/providers/publisher.js';
import { sanitizeFilename } from './server/lib/text.js';
import { runsDir } from './server/lib/paths.js';

const lyrics = `[Intro]
你走那天 天很晴
晴得像 从没爱过我

[Verse 1]
你说走的时候 我正给你倒水
杯子还烫着手 你已经背对
我数你的脚步 一步比一步远
门关上那一声 轻得像句抱歉

[Pre-Chorus]
我以为天会下雨 好歹陪我哭一场
可它偏偏那么蓝 蓝得那么荒凉

[Chorus]
你走那天也没下雨 阳光晃得我睁不开眼睛
我站在原地 假装还闻得到你呼吸
你走那天也没下雨 眼泪却淋湿了整个曾经
从此每一种天气 都是没有你的阴天里

[Verse 2]
你的牙刷还在 我一直没舍得扔
你修好那盏灯 亮着都是余生
我把你的名字 存成陌生号码
可指尖按下去 还是那么听话

[Bridge]
如果那天下了雨 你会不会多留一秒钟
如果我哭得更用力 结局会不会有点不同
可惜天没下雨 你也没有回头
把我一个人 留在晴天的尽头

[Outro]
你走那天也没下雨
我却 湿了一辈子`;

const input = {
  title: '你走那天也没下雨',
  artist: '林晚',
  theme: '离别后独自一人的思念与心碎，用晴天反衬内心的雨与泪，苦情深情',
  genre: '抒情华语流行 苦情民谣',
  mood: '悲伤 心碎 深情 遗憾',
  duration: 180
};

const step = process.argv[2] || 'all';
const id = process.env.RUN_ID || nanoid(10);
const dir = path.join(runsDir, id);
await fs.mkdir(dir, { recursive: true });
const base = sanitizeFilename(input.title);
const f = {
  lyricsPath: path.join(dir, `${base}.lyrics.txt`),
  rawCoverPath: path.join(dir, `${base}.raw.png`),
  finalCoverPath: path.join(dir, `${base}.png`),
  audioPath: path.join(dir, `${base}.mp3`),
  packagePath: path.join(dir, `${base}.tomato-package.zip`)
};
console.log('RUN_ID=' + id, 'DIR=' + dir);
await fs.writeFile(f.lyricsPath, lyrics, 'utf8');
console.log('[lyrics] written', f.lyricsPath);

try {
  if (step === 'music' || step === 'all') {
    console.log('[music] generating (MiniMax free)...');
    const r = await generateMusic(input, lyrics, f.audioPath);
    const st = await fs.stat(f.audioPath);
    console.log('[music] DONE', JSON.stringify(r), 'size=' + st.size);
  }
  if (step === 'cover' || step === 'all') {
    console.log('[cover] generating...');
    await generateCover(input, f.rawCoverPath);
    await postProcessCover(input, f.rawCoverPath, f.finalCoverPath);
    console.log('[cover] DONE', f.finalCoverPath);
  }
  if (step === 'package' || step === 'all') {
    console.log('[package] zipping...');
    await createPackage(input, f.audioPath, f.finalCoverPath, lyrics, f.packagePath);
    console.log('[package] DONE', f.packagePath);
  }
  console.log('ALL_OK');
} catch (e) {
  console.error('STEP_FAIL', step, e.message);
  process.exit(1);
}
