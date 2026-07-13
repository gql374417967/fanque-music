import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { generateLyrics, generateTheme, generateTitle } from './providers/lyrics.js';
import { generateMusic } from './providers/music.js';
import { generateCover, postProcessCover } from './providers/cover.js';
import { createPackage, publishToTomato } from './providers/publisher.js';
import { publicAssetPath, runDir } from './lib/paths.js';
import { sanitizeFilename } from './lib/text.js';

const runs = new Map();
const stepTemplate = [
  ['lyrics', '歌词生成 DeepSeek/V4'],
  ['music', '音乐生成 MiniMax music-2.6-free'],
  ['cover', '封面生成 Agnes 1024x1024'],
  ['postCover', '封面后处理 1440x1440'],
  ['package', 'MP3 + PNG 发布包'],
  ['publish', '番茄音乐发布上传']
];
const stepOrder = stepTemplate.map(([id]) => id);
const runnableSteps = new Set(stepOrder);

function publicRun(run) {
  return {
    ...run,
    audioPath: undefined,
    coverPath: undefined,
    rawCoverPath: undefined,
    packagePath: undefined,
    audioUrl: publicAssetPath(run.audioPath),
    coverUrl: publicAssetPath(run.coverPath),
    rawCoverUrl: publicAssetPath(run.rawCoverPath),
    packageUrl: publicAssetPath(run.packagePath)
  };
}

function touch(run) {
  run.updatedAt = new Date().toISOString();
}

function setStep(run, id, status, detail) {
  const step = run.steps.find((item) => item.id === id);
  if (step) Object.assign(step, { status, detail });
  touch(run);
}

function resetFrom(run, stepId) {
  const start = stepOrder.indexOf(stepId);
  if (start < 0) return;
  for (const id of stepOrder.slice(start)) {
    setStep(run, id, 'pending', undefined);
  }
  if (stepOrder.indexOf(stepId) <= stepOrder.indexOf('lyrics')) {
    run.lyrics = undefined;
    if (run.autoGenerate?.title) run.input.title = '';
    if (run.autoGenerate?.theme) run.input.theme = '';
  }
  if (stepOrder.indexOf(stepId) <= stepOrder.indexOf('music')) {
    run.audioPath = undefined;
    run.audioSourceUrl = undefined;
  }
  if (stepOrder.indexOf(stepId) <= stepOrder.indexOf('cover')) {
    run.rawCoverPath = undefined;
    run.coverPath = undefined;
  }
  if (stepOrder.indexOf(stepId) <= stepOrder.indexOf('package')) {
    run.packagePath = undefined;
  }
  if (stepOrder.indexOf(stepId) <= stepOrder.indexOf('publish')) {
    run.publishResult = undefined;
  }
}

function pathsFor(run) {
  const dir = runDir(run.id);
  const base = sanitizeFilename(run.input.title || run.id);
  return {
    dir,
    lyricsPath: path.join(dir, `${base}.lyrics.txt`),
    rawCoverPath: path.join(dir, `${base}.raw.png`),
    finalCoverPath: path.join(dir, `${base}.png`),
    audioPath: path.join(dir, `${base}.mp3`),
    packagePath: path.join(dir, `${base}.tomato-package.zip`)
  };
}

function requireDone(run, stepIds) {
  const missing = stepIds.find((id) => !['done', 'skipped'].includes(run.steps.find((step) => step.id === id)?.status));
  if (missing) throw new Error(`请先确认完成上一步：${run.steps.find((step) => step.id === missing)?.label || missing}`);
}

export function listRuns() {
  return [...runs.values()].map(publicRun).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getRun(id) {
  const run = runs.get(id);
  return run ? publicRun(run) : undefined;
}

export async function saveLyrics(id, lyrics) {
  const run = runs.get(id);
  if (!run) return undefined;
  const text = String(lyrics || '').trim();
  if (!text) throw new Error('歌词不能为空');
  if (run.status === 'running') throw new Error('任务正在执行，请稍后再编辑');
  const files = pathsFor(run);
  await fs.mkdir(files.dir, { recursive: true });
  run.lyrics = text;
  await fs.writeFile(files.lyricsPath, text, 'utf8');
  resetFrom(run, 'music');
  setStep(run, 'lyrics', 'done', '歌词已保存确认，可生成音乐');
  run.status = 'waiting';
  run.error = undefined;
  touch(run);
  return publicRun(run);
}

export async function replaceCover(id, sourcePath) {
  const run = runs.get(id);
  if (!run) return undefined;
  if (run.status === 'running') throw new Error('任务正在执行，请稍后再替换封面');
  if (!sourcePath) throw new Error('请选择封面图片');
  const files = pathsFor(run);
  await fs.mkdir(files.dir, { recursive: true });
  await fs.copyFile(sourcePath, files.rawCoverPath);
  run.rawCoverPath = files.rawCoverPath;
  run.coverPath = undefined;
  resetFrom(run, 'postCover');
  setStep(run, 'cover', 'done', '封面已替换确认，可继续后处理');
  run.status = 'waiting';
  run.error = undefined;
  touch(run);
  return publicRun(run);
}

export async function createWorkflow(input) {
  const id = nanoid(10);
  const now = new Date().toISOString();
  const run = {
    id,
    input,
    autoGenerate: {
      title: !input.title,
      theme: !input.theme
    },
    status: 'idle',
    createdAt: now,
    updatedAt: now,
    activeStep: undefined,
    steps: stepTemplate.map(([stepId, label]) => ({ id: stepId, label, status: 'pending' }))
  };
  runs.set(id, run);
  await fs.mkdir(runDir(id), { recursive: true });
  return publicRun(run);
}

export async function startWorkflow(input) {
  return createWorkflow(input);
}

export function stopWorkflow(id) {
  const run = runs.get(id);
  if (!run) return undefined;
  run.stopRequested = true;
  if (run.status === 'running' && run.activeStep) {
    setStep(run, run.activeStep, 'stopping', '已请求停止，当前接口返回后会停住');
  } else {
    run.status = 'stopped';
    touch(run);
  }
  return publicRun(run);
}

function assertNotStopped(run) {
  if (run.stopRequested) {
    run.status = 'stopped';
    throw new Error('已停止，未继续执行下一步');
  }
}

async function runLyrics(run, files) {
  if (run.autoGenerate?.title || !run.input.title) {
    run.input.title = await generateTitle({ ...run.input, title: '' });
  }
  assertNotStopped(run);
  if (run.autoGenerate?.theme || !run.input.theme) {
    run.input.theme = await generateTheme({ ...run.input, theme: '' });
  }
  assertNotStopped(run);
  const currentFiles = pathsFor(run);
  const lyrics = await generateLyrics(run.input);
  run.lyrics = lyrics;
  await fs.writeFile(currentFiles.lyricsPath, lyrics, 'utf8');
  return '已生成歌词；不满意可点重新生成，满意后再生成音乐';
}

async function runMusic(run, files) {
  requireDone(run, ['lyrics']);
  if (!run.lyrics) throw new Error('缺少歌词，请先生成歌词');
  const musicResult = await generateMusic(run.input, run.lyrics, files.audioPath);
  run.audioPath = musicResult.path;
  run.audioSourceUrl = musicResult.sourceUrl;
  return musicResult.reason || (musicResult.sourceUrl ? '已从 MiniMax 返回的音频 URL 下载 MP3' : musicResult.sourceType === 'hex' ? 'MiniMax 返回 hex 音频，已解码为 MP3' : 'MP3 已生成');
}

async function runCover(run, files) {
  requireDone(run, ['lyrics']);
  const coverResult = await generateCover(run.input, files.rawCoverPath);
  run.rawCoverPath = coverResult.path;
  return coverResult.reason || '1024 封面已生成';
}

async function runPostCover(run, files) {
  requireDone(run, ['cover']);
  if (!run.rawCoverPath) throw new Error('缺少原始封面，请先生成封面');
  run.coverPath = await postProcessCover(run.input, run.rawCoverPath, files.finalCoverPath);
  return 'PNG 1440x1440，底部已叠加歌名';
}

async function runPackage(run, files) {
  requireDone(run, ['music', 'postCover']);
  if (!run.audioPath || !run.coverPath || !run.lyrics) throw new Error('缺少音频、封面或歌词，无法打包');
  run.packagePath = await createPackage(run.input, run.audioPath, run.coverPath, run.lyrics, files.packagePath);
  return '已生成番茄发布包';
}

async function runPublish(run, files) {
  requireDone(run, ['package']);
  if (run.input.publishMode === 'package') {
    run.publishResult = { skipped: true, reason: '选择了生成包模式，未自动发布。' };
  } else {
    run.publishResult = await publishToTomato(run.input, run.audioPath, run.coverPath, run.lyrics);
  }
  run.status = 'done';
  return run.publishResult?.reason || '发布接口已返回成功';
}

const stepHandlers = {
  lyrics: runLyrics,
  music: runMusic,
  cover: runCover,
  postCover: runPostCover,
  package: runPackage,
  publish: runPublish
};

export async function runWorkflowStep(id, stepId, options = {}) {
  const run = runs.get(id);
  if (!run) return undefined;
  if (!runnableSteps.has(stepId)) throw new Error('未知步骤');
  if (run.status === 'running') throw new Error('已有步骤正在执行，请先等待或停止');

  run.stopRequested = false;
  run.error = undefined;
  run.status = 'running';
  run.activeStep = stepId;
  if (options.regenerate) resetFrom(run, stepId);
  setStep(run, stepId, 'running', options.regenerate ? '正在重新生成' : '正在生成');

  const files = pathsFor(run);
  await fs.mkdir(files.dir, { recursive: true });

  try {
    const detail = await stepHandlers[stepId](run, files);
    assertNotStopped(run);
    const publishSkipped = stepId === 'publish' && run.publishResult?.skipped;
    setStep(run, stepId, publishSkipped ? 'skipped' : 'done', detail);
    run.activeStep = undefined;
    run.status = stepId === 'publish' ? 'done' : 'waiting';
    touch(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.activeStep = undefined;
    if (run.stopRequested || message.includes('已停止')) {
      run.status = 'stopped';
      setStep(run, stepId, 'pending', '已停止，可重新生成本步骤');
      run.stopRequested = false;
    } else {
      run.status = 'failed';
      run.error = message;
      setStep(run, stepId, 'failed', message);
    }
    touch(run);
  }
  return publicRun(run);
}
