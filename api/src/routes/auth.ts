import { Router } from 'express';
import { authMiddleware } from '../auth';
import { config } from '../config';

export const authRouter = Router();

authRouter.get('/mode', (_req, res) => {
  res.json({ authMode: config.authMode });
});

authRouter.get('/verify', authMiddleware, (req, res) => {
  const user = req.user;
  if (!user) {
    res.json({ ok: true });
    return;
  }
  res.json({
    ok: true,
    user: {
      mode: user.mode,
      email: user.email,
      name: user.name,
      tenantId: user.tid,
      scopes: user.scopes,
      roles: user.roles
    }
  });
});
