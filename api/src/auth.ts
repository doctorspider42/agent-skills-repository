import { Request, Response, NextFunction } from 'express';
import { config } from './config';

const validKeys = new Set(config.apiKeys);

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('x-api-key') || extractBearer(req.header('authorization'));
  if (!header || !validKeys.has(header)) {
    res.status(401).json({ error: 'invalid_api_key' });
    return;
  }
  next();
}

function extractBearer(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim();
}
