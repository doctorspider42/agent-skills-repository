import { NextFunction, Router, Request, Response } from 'express';
import { authMiddleware } from '../auth';
import { blobPathFor, getCatalogue, toSummary } from '../agents/service';
import { streamAgentZip } from '../agents/zip';
import { agentsContainerClient } from '../azure/blobClient';

export const agentsRouter = Router();

agentsRouter.use(authMiddleware);

agentsRouter.get('/', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const catalogue = await getCatalogue(force);
    const summaries = Array.from(catalogue.values())
      .map(toSummary)
      .sort((a, b) => a.id.localeCompare(b.id));
    res.json({ agents: summaries });
  } catch (err) {
    next(err);
  }
});

agentsRouter.get('/:id', agentDetailHandler);
agentsRouter.get('/:id/download', agentDownloadHandler);
agentsRouter.get('/*/download', agentDownloadHandler);
agentsRouter.get('/:id/files/*', agentFileHandler);
agentsRouter.get('/*/files/*', agentFileHandler);
agentsRouter.get('/*', agentDetailHandler);

async function agentDetailHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = decodeId(req);
    const catalogue = await getCatalogue();
    const detail = catalogue.get(id);
    if (!detail) {
      res.status(404).json({ error: 'agent_not_found', id });
      return;
    }
    res.json(detail);
  } catch (err) {
    next(err);
  }
}

async function agentDownloadHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = decodeId(req);
    const catalogue = await getCatalogue();
    const detail = catalogue.get(id);
    if (!detail) {
      res.status(404).json({ error: 'agent_not_found', id });
      return;
    }
    await streamAgentZip(detail, res);
  } catch (err) {
    next(err);
  }
}

async function agentFileHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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
      res.status(404).json({ error: 'agent_not_found', id });
      return;
    }

    const fileEntry = detail.files.find((f) => f.path === relPath);
    if (!fileEntry) {
      res.status(404).json({ error: 'file_not_found', id, path: relPath });
      return;
    }

    const blobName = blobPathFor(id, relPath);
    const download = await agentsContainerClient.getBlobClient(blobName).download();

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
