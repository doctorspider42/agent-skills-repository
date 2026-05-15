import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { SkillsApiClient } from './api/client';
import { recordInstall, removeInstall } from './manifest';
import { InstallScope, SkillDetail, InstalledSkill } from './types';

export interface InstallOptions {
  detail: SkillDetail;
  installRoot: string;
  scope: InstallScope;
  source: string;
}

export async function installSkill(
  client: SkillsApiClient,
  opts: InstallOptions
): Promise<InstalledSkill> {
  const zipBuffer = await client.downloadSkillZip(opts.detail.id);
  const targetDir = path.join(opts.installRoot, opts.detail.directoryName);

  await fs.mkdir(targetDir, { recursive: true });
  extractZipSafely(zipBuffer, targetDir);

  const entry: InstalledSkill = {
    id: opts.detail.id,
    name: opts.detail.metadata.name,
    installedVersion: opts.detail.metadata.version,
    source: opts.source,
    installedAt: new Date().toISOString(),
    files: opts.detail.files.map((f) => f.path),
    scope: opts.scope,
    installPath: targetDir
  };

  await recordInstall(opts.installRoot, entry);
  return entry;
}

export async function uninstallSkill(
  rootDir: string,
  id: string,
  installPath: string
): Promise<void> {
  try {
    await fs.rm(installPath, { recursive: true, force: true });
  } finally {
    await removeInstall(rootDir, id);
  }
}

function extractZipSafely(buffer: Buffer, destination: string): void {
  const zip = new AdmZip(buffer);
  const absDest = path.resolve(destination);

  for (const entry of zip.getEntries()) {
    // Reject path traversal — entry names must stay inside destination
    const resolved = path.resolve(absDest, entry.entryName);
    if (!resolved.startsWith(absDest + path.sep) && resolved !== absDest) {
      throw new Error(`Refusing to extract entry outside destination: ${entry.entryName}`);
    }
  }

  zip.extractAllTo(destination, /* overwrite */ true);
}
