import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { ensureStorage, rootDir, uploadsDir } from './lib/paths.js';
import { getRun, listRuns, startWorkflow } from './workflow.js';

const app = express();
const upload = multer({ dest: uploadsDir });
const port = Number(process.env.PORT ?? 8787);

const inputSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  theme: z.string().min(1),
  genre: z.string().min(1),
  mood: z.string().min(1),
  duration: z.coerce.number().min(120).max(210).default(170),
  publishMode: z.enum(['draft', 'publish', 'package']).default('package')
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/assets', express.static(rootDir, { fallthrough: false }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tomato-music-workflow' });
});

app.get('/api/runs', (_req, res) => {
  res.json(listRuns());
});

app.get('/api/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
});

app.post('/api/workflows', upload.single('referenceAudio'), async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const run = await startWorkflow({ ...parsed.data, referenceAudioPath: req.file?.path });
  res.status(202).json(run);
});

app.use(express.static(path.join(rootDir, 'dist-client')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(rootDir, 'dist-client', 'index.html'));
});

ensureStorage().then(() => {
  app.listen(port, '127.0.0.1', () => {
    console.log(`Tomato Music Workflow API http://127.0.0.1:${port}`);
  });
});
