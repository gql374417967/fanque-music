import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { generateLyrics } from './providers/lyrics.js';
import { generateMusic } from './providers/music.js';
import { generateCover, postProcessCover } from './providers/cover.js';
import { createPackage, publishToTomato } from './providers/publisher.js';
import { publicAssetPath, runDir } from './lib/paths.js';
import { sanitizeFilename } from './lib/text.js';
import type { PublicRun, WorkflowInput, WorkflowRun, WorkflowStep } from './types.js';

const runs = new Map<string, WorkflowRun>();

const stepLabels = [
  ['lyrics', 'DeepSeek/V4 歌词生成'],
  ['music', 'MiniMax music-2.6-free 音乐生成'],
  ['cover', 'Agnes 1024 写实人物封面'],
  ['postCover', '封面升采样 1440x1440 + 底部歌名'],
  ['package', 'MP3 + PNG + 歌词发布包'],
  ['publish', '番茄音乐发布上传']
] as const;

function initialSteps(): WorkflowStep[] {
  return stepLabels.map(([id, label]) => ({ id, label, status: 'pending' }));
}

function touch(run: WorkflowRun) {
  run.updatedAt = new Date().toISOString();
}

function setStep(run: WorkflowRun, id: string, status: WorkflowStep['status'], detail?: string) {
  const step = run.steps.find((item) => item.id === id);
  if (!step) return;
  step.status = status;
  step.detail = detail;
  if (status === 'running') step.startedAt = new Date().toISOString();
  if (['done', 'failed', 'skipped'].includes(status)) step.finishedAt = new Date().toISOString();
  touch(run);
}

export function toPublicRun(run: WorkflowRun): PublicRun {
  return {
    ...run,
    audioUrl: publicAssetPath(run.audioPath),
    coverUrl: publicAssetPath(run.coverPath),
    packageUrl: publicAssetPath(run.packagePath)
  };
}

export function getRun(id: string) {
  const run = runs.get(id);
  return run ? toPublicRun(run) : undefined;
}

export function listRuns() {
  return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toPublicRun);
}

export async function startWorkflow(input: WorkflowInput) {
  const id = nanoid(10);
  const now = new Date().toISOString();
  const run: WorkflowRun = { id, input, status: 'running', createdAt: now, updatedAt: now, steps: initialSteps() };
  runs.set(id, run);
  void executeWorkflow(run);
  return toPublicRun(run);
}

async function executeWorkflow(run: WorkflowRun) {
  const folder = runDir(run.id);
  await fs.mkdir(folder, { recursive: true });
  const baseName = sanitizeFilename(run.input.title || run.id);
  try {
    setStep(run, 'lyrics', 'running');
    const lyrics = await generateLyrics(run.input);
    run.lyrics = lyrics;
    await fs.writeFile(path.join(folder, `${baseName}.lyrics.txt`), lyrics, 'utf8');
    setStep(run, 'lyrics', 'done', '歌词已生成并清理括号说明。');

    setStep(run, 'music', 'running');
    const audioPath = path.join(folder, `${baseName}.mp3`);
    const musicResult = await generateMusic(run.input, lyrics, audioPath);
    run.audioPath = audioPath;
    setStep(run, 'music', 'done', musicResult.note ?? '音乐文件已生成。');

    setStep(run, 'cover', 'running');
    const rawCover = path.join(folder, `${baseName}.raw.png`);
    const coverResult = await generateCover(run.input, rawCover);
    setStep(run, 'cover', 'done', coverResult.note ?? '封面已生成。');

    setStep(run, 'postCover', 'running');
    const finalCover = path.join(folder, `${baseName}.png`);
    await postProcessCover(rawCover, finalCover, run.input.title);
    run.coverPath = finalCover;
    setStep(run, 'postCover', 'done', '封面已输出为1440x1440 PNG。');

    setStep(run, 'package', 'running');
    const packagePath = path.join(folder, `${baseName}.tomato-package.zip`);
    await createPackage(run.input, audioPath, finalCover, lyrics, packagePath);
    run.packagePath = packagePath;
    setStep(run, 'package', 'done', '发布包已生成。');

    setStep(run, 'publish', 'running');
    const publishResult = await publishToTomato(run.input, audioPath, finalCover, lyrics);
    run.publishResult = publishResult;
    setStep(run, 'publish', publishResult && typeof publishResult === 'object' && 'skipped' in publishResult ? 'skipped' : 'done', JSON.stringify(publishResult));

    run.status = 'done';
    touch(run);
  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : String(error);
    const running = run.steps.find((step) => step.status === 'running');
    if (running) setStep(run, running.id, 'failed', run.error);
    touch(run);
  }
}
