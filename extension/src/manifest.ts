import * as fs from 'fs/promises';
import * as path from 'path';
import { InstalledSkill, InstallScope } from './types';

const FILENAME = '.skills-manifest.json';
const SCHEMA_VERSION = 1;

interface ManifestFile {
  version: number;
  skills: Record<string, InstalledSkill>;
}

function emptyManifest(): ManifestFile {
  return { version: SCHEMA_VERSION, skills: {} };
}

function manifestPath(rootDir: string): string {
  return path.join(rootDir, FILENAME);
}

export async function readManifest(rootDir: string): Promise<ManifestFile> {
  try {
    const raw = await fs.readFile(manifestPath(rootDir), 'utf8');
    const parsed = JSON.parse(raw) as ManifestFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.skills) return emptyManifest();
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyManifest();
    throw err;
  }
}

async function writeManifest(rootDir: string, data: ManifestFile): Promise<void> {
  await fs.mkdir(rootDir, { recursive: true });
  await fs.writeFile(manifestPath(rootDir), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function recordInstall(
  rootDir: string,
  entry: InstalledSkill
): Promise<void> {
  const manifest = await readManifest(rootDir);
  manifest.skills[entry.id] = entry;
  await writeManifest(rootDir, manifest);
}

export async function removeInstall(rootDir: string, id: string): Promise<void> {
  const manifest = await readManifest(rootDir);
  delete manifest.skills[id];
  await writeManifest(rootDir, manifest);
}

export interface InstalledLookup {
  entry: InstalledSkill;
  rootDir: string;
  scope: InstallScope;
}

export async function findInstalled(
  id: string,
  candidateRoots: { scope: InstallScope; path: string }[]
): Promise<InstalledLookup | undefined> {
  for (const root of candidateRoots) {
    const manifest = await readManifest(root.path);
    const entry = manifest.skills[id];
    if (entry) {
      return { entry, rootDir: root.path, scope: root.scope };
    }
  }
  return undefined;
}

export async function collectInstalled(
  candidateRoots: { scope: InstallScope; path: string }[]
): Promise<Map<string, InstalledLookup>> {
  const out = new Map<string, InstalledLookup>();
  for (const root of candidateRoots) {
    const manifest = await readManifest(root.path);
    for (const [id, entry] of Object.entries(manifest.skills)) {
      // first hit wins — project scope is checked before global by caller order
      if (!out.has(id)) {
        out.set(id, { entry, rootDir: root.path, scope: root.scope });
      }
    }
  }
  return out;
}
