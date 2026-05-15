import { Response } from 'express';
import archiver from 'archiver';
import { agentsContainerClient, downloadBlobToBuffer } from '../azure/blobClient';
import { AgentDetail } from '../types';

export async function streamAgentZip(detail: AgentDetail, res: Response): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const filename = `${detail.directoryName}-${detail.metadata.version}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitize(filename)}"`);

  archive.on('warning', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  });

  archive.pipe(res);

  for (const file of detail.files) {
    const blobName = `${detail.id}/${file.path}`;
    const buffer = await downloadBlobToBuffer(blobName, agentsContainerClient);
    archive.append(buffer, { name: file.path });
  }

  await archive.finalize();
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}
