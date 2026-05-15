import { Router } from 'express';
import { apiKeyAuth } from '../auth';

export const authRouter = Router();

authRouter.get('/verify', apiKeyAuth, (_req, res) => {
  res.json({ ok: true });
});
