import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { SkillsApiClient } from './api/client';
import { recordInstall, removeInstall } from './agentManifest';
import { InstallScope, AgentDetail, InstalledAgent } from './types';

export interface InstallAgentOptions {
  detail: AgentDetail;
  installRoot: string;
  scope: InstallScope;
  source: string;
}

export async function installAgent(
  client: SkillsApiClient,
  opts: InstallAgentOptions
): Promise<InstalledAgent> {
  const zipBuffer = await client.downloadAgentZip(opts.detail.id);
  const markerFile = `${opts.detail.directoryName}.md`;

  await fs.mkdir(opts.installRoot, { recursive: true });
  const installedFiles = extractAgentMarker(zipBuffer, opts.installRoot, markerFile);

  const entry: InstalledAgent = {
    id: opts.detail.id,
    name: opts.detail.metadata.name,
    installedVersion: opts.detail.metadata.version,
    source: opts.source,
    installedAt: new Date().toISOString(),
    files: installedFiles,
    scope: opts.scope,
    installPath: path.join(opts.installRoot, markerFile)
  };

  await recordInstall(opts.installRoot, entry);
  return entry;
}

export async function uninstallAgent(
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

// Agents install flat: only the `{directoryName}.md` file is copied into the
// install root. The agent.yml is metadata for the marketplace and is not part
// of the runtime artifact.
function extractAgentMarker(buffer: Buffer, destination: string, markerFile: string): string[] {
  const zip = new AdmZip(buffer);
  const absDest = path.resolve(destination);
  const written: string[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entry.entryName !== markerFile) continue;

    const resolved = path.resolve(absDest, entry.entryName);
    if (!resolved.startsWith(absDest + path.sep) && resolved !== absDest) {
      throw new Error(`Refusing to extract entry outside destination: ${entry.entryName}`);
    }

    zip.extractEntryTo(entry, destination, /* maintainEntryPath */ false, /* overwrite */ true);
    written.push(entry.entryName);
  }

  if (written.length === 0) {
    throw new Error(`Agent archive did not contain the expected marker file "${markerFile}".`);
  }
  return written;
}
