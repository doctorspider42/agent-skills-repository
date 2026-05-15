import { NextFunction, Router, Request, Response } from 'express';
import { apiKeyAuth } from '../auth';
import { blobPathFor, getCatalogue, toSummary } from '../skills/service';
import { streamSkillZip } from '../skills/zip';
import { containerClient } from '../azure/blobClient';

export const skillsRouter = Router();

skillsRouter.use(apiKeyAuth);

skillsRouter.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const catalogue = await getCatalogue(force);
    const summaries = Array.from(catalogue.values())
      .map(toSummary)
      .sort((a, b) => a.id.localeCompare(b.id));
    res.json({ skills: summaries });
  } catch (err) {
    next(err);
  }
});

skillsRouter.get('/:id', skillDetailHandler);
skillsRouter.get('/:id/download', skillDownloadHandler);
skillsRouter.get('/*/download', skillDownloadHandler);
skillsRouter.get('/:id/files/*', skillFileHandler);
skillsRouter.get('/*/files/*', skillFileHandler);
skillsRouter.get('/*', skillDetailHandler);

async function skillDetailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = decodeId(req);
    const catalogue = await getCatalogue();
    const detail = catalogue.get(id);
    if (!detail) {
      res.status(404).json({ error: 'skill_not_found', id });
      return;
    }
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

async function skillDownloadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = decodeId(req);
    const catalogue = await getCatalogue();
    const detail = catalogue.get(id);
    if (!detail) {
      res.status(404).json({ error: 'skill_not_found', id });
      return;
    }
    await streamSkillZip(detail, res);
  } catch (err) {
    next(err);
  }
}

// Both the skill id and file path may contain slashes, so wildcard routes keep
// nested marketplace categories addressable.
async function skillFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = decodeId(req);
    const relPath = decodeFilePath(req);
    if (!relPath) {
      res.status(400).json({ error: 'missing_file_path' });
      return;
    }

    const catalogue = await getCatalogue();
    const detail = catalogue.get(id);
    if (!detail) {
      res.status(404).json({ error: 'skill_not_found', id });
      return;
    }

    const fileEntry = detail.files.find((f) => f.path === relPath);
    if (!fileEntry) {
      res.status(404).json({ error: 'file_not_found', id, path: relPath });
      return;
    }

    const blobName = blobPathFor(id, relPath);
    const download = await containerClient.getBlobClient(blobName).download();

    if (fileEntry.contentType) {
      res.setHeader('Content-Type', fileEntry.contentType);
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    if (download.contentLength) {
      res.setHeader('Content-Length', String(download.contentLength));
    }

    const stream = download.readableStreamBody;
    if (!stream) {
      res.status(500).json({ error: 'empty_stream' });
      return;
    }
    (stream as NodeJS.ReadableStream).pipe(res);
  } catch (err) {
    next(err);
  }
}

function decodeId(req: Request): string {
  const params = req.params as Record<string, string | undefined>;
  return decodeURIComponent(params.id ?? params[0] ?? '');
}

function decodeFilePath(req: Request): string {
  const params = req.params as Record<string, string | undefined>;
  const rawPath = typeof params.id === 'string' ? params[0] : params[1];
  return rawPath ? decodeURIComponent(rawPath) : '';
}
