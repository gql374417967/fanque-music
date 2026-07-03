import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { ensureStorage, rootDir, uploadsDir } from './lib/paths.js';
import { diagnoseRuntimeConfig, getRuntimeConfig, publicConfig, saveRuntimeConfig } from './lib/config.js';
import { createWorkflow, getRun, listRuns, runWorkflowStep, stopWorkflow } from './workflow.js';

const app = express();
const upload = multer({ dest: uploadsDir });
const port = Number(process.env.PORT || 8787);

const inputSchema = z.object({
  title: z.string().trim().optional().default(''),
  artist: z.string().min(1),
  theme: z.string().trim().optional().default(''),
  genre: z.string().min(1),
  mood: z.string().min(1),
  duration: z.coerce.number().min(120).max(210).default(170),
  publishMode: z.enum(['draft', 'publish', 'package']).default('package')
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/assets', express.static(rootDir, { fallthrough: false }));
app.use(express.static(path.join(rootDir, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'tomato-music-workflow' }));
app.get('/api/config', async (_req, res, next) => {
  try {
    res.json(publicConfig(await getRuntimeConfig()));
  } catch (error) {
    next(error);
  }
});
app.post('/api/config', async (req, res, next) => {
  try {
    res.json(publicConfig(await saveRuntimeConfig(req.body || {})));
  } catch (error) {
    next(error);
  }
});
app.post('/api/config/diagnose', async (req, res, next) => {
  try {
    res.json(await diagnoseRuntimeConfig({ currentOnly: req.body?.currentOnly === true }));
  } catch (error) {
    next(error);
  }
});
app.get('/api/runs', (_req, res) => res.json(listRuns()));
function sendRun(req, res) {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
}

app.get('/api/runs/:id', sendRun);
app.get('/api/workflows/:id', sendRun);

app.post('/api/workflows', upload.single('referenceAudio'), async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const run = await createWorkflow({ ...parsed.data, referenceAudioPath: req.file?.path });
  res.status(201).json(run);
});

app.post('/api/workflows/:id/steps/:stepId/run', async (req, res, next) => {
  try {
    const run = await runWorkflowStep(req.params.id, req.params.stepId, { regenerate: req.body?.regenerate === true });
    if (!run) return res.status(404).json({ error: 'run not found' });
    res.status(202).json(run);
  } catch (error) {
    next(error);
  }
});

app.post('/api/workflows/:id/stop', (req, res) => {
  const run = stopWorkflow(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
});

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

ensureStorage().then(() => {
  app.listen(port, '127.0.0.1', () => console.log(`Tomato Music Workflow http://127.0.0.1:${port}`));
});
