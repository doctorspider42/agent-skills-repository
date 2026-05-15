#!/usr/bin/env node
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth';
import { skillsRouter } from './routes/skills';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/auth', authRouter);
app.use('/skills', skillsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'internal_error', message: err.message });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${config.port}`);
});
