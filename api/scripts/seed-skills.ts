/**
 * Uploads everything under example-skills/ (or a path passed as the first arg)
 * into the configured Azure Blob container, mirroring the directory layout as
 * blob names. Existing blobs with the same name are overwritten.
 *
 *   npm run seed                       # uses ../example-skills
 *   npm run seed -- ./my-skills        # custom source path
 *   npm run seed -- ./my-skills --wipe # deletes existing blobs first
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { containerClient } from '../src/azure/blobClient';
import { config } from '../src/config';

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8'
};

interface Args {
  sourceDir: string;
  wipe: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const wipe = args.includes('--wipe');
  const positional = args.filter((a) => !a.startsWith('--'));
  const sourceDir = positional[0]
    ? path.resolve(positional[0])
    : path.resolve(__dirname, '..', '..', 'example-skills');
  return { sourceDir, wipe };
}

async function ensureContainer(): Promise<void> {
  const created = await containerClient.createIfNotExists();
  if (created.succeeded) {
    console.log(`[seed] created container "${config.azure.container}"`);
  }
}

async function wipeContainer(): Promise<number> {
  let deleted = 0;
  for await (const blob of containerClient.listBlobsFlat()) {
    await containerClient.deleteBlob(blob.name);
    deleted++;
  }
  return deleted;
}

async function* walk(dir: string, base: string): AsyncGenerator<{ abs: string; rel: string }> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Source directory does not exist: ${dir}`);
    }
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store, .git, etc.
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(abs, base);
    } else if (entry.isFile()) {
      const rel = path.relative(base, abs).split(path.sep).join('/');
      yield { abs, rel };
    }
  }
}

async function uploadFile(absPath: string, blobName: string): Promise<number> {
  const buf = await fs.readFile(absPath);
  const blockBlob = containerClient.getBlockBlobClient(blobName);
  const ext = path.extname(absPath).toLowerCase();
  await blockBlob.uploadData(buf, {
    blobHTTPHeaders: {
      blobContentType: CONTENT_TYPES[ext] ?? 'application/octet-stream'
    }
  });
  return buf.byteLength;
}

async function main(): Promise<void> {
  const { sourceDir, wipe } = parseArgs();
  console.log(`[seed] source : ${sourceDir}`);
  console.log(`[seed] target : container "${config.azure.container}"`);
  console.log(`[seed] wipe   : ${wipe ? 'YES' : 'no'}`);

  await ensureContainer();

  if (wipe) {
    const n = await wipeContainer();
    console.log(`[seed] deleted ${n} existing blob(s)`);
  }

  let count = 0;
  let bytes = 0;
  for await (const file of walk(sourceDir, sourceDir)) {
    const size = await uploadFile(file.abs, file.rel);
    count++;
    bytes += size;
    console.log(`  + ${file.rel}  (${size} B)`);
  }

  console.log(`[seed] done — ${count} file(s), ${(bytes / 1024).toFixed(1)} KiB`);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
