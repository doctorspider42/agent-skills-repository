import { downloadBlobToBuffer, listAllBlobs, BlobEntry } from '../azure/blobClient';
import { SkillDetail, SkillFileEntry, SkillSummary } from '../types';
import { parseSkillYml } from './parser';
import { config } from '../config';

const SKILL_MARKER = 'SKILL.md';
const METADATA_FILE = 'skill.yml';

interface CatalogueCache {
  skills: Map<string, SkillDetail>;
  builtAt: number;
}

let cache: CatalogueCache | null = null;
let inflight: Promise<CatalogueCache> | null = null;

export async function getCatalogue(force = false): Promise<Map<string, SkillDetail>> {
  if (!force && cache && fresh(cache)) {
    return cache.skills;
  }
  if (inflight) return (await inflight).skills;

  inflight = build().finally(() => {
    inflight = null;
  });
  cache = await inflight;
  return cache.skills;
}

function fresh(c: CatalogueCache): boolean {
  if (config.cacheTtlSeconds <= 0) return false;
  return Date.now() - c.builtAt < config.cacheTtlSeconds * 1000;
}

async function build(): Promise<CatalogueCache> {
  const blobs = await listAllBlobs();
  const byDir = groupByDirectory(blobs);

  const skills = new Map<string, SkillDetail>();

  for (const [dir, files] of byDir) {
    const hasSkill = files.some((f) => relativeName(f.name, dir) === SKILL_MARKER);
    if (!hasSkill) continue;

    const ymlBlob = files.find((f) => relativeName(f.name, dir) === METADATA_FILE);
    let rawYml: string | undefined;
    if (ymlBlob) {
      try {
        const buf = await downloadBlobToBuffer(ymlBlob.name);
        rawYml = buf.toString('utf8');
      } catch (err) {
        rawYml = undefined;
      }
    }

    const segments = dir.split('/').filter(Boolean);
    const directoryName = segments[segments.length - 1] ?? dir;
    const category = segments.slice(0, -1);

    const { metadata, error } = parseSkillYml(rawYml, directoryName);

    const fileEntries: SkillFileEntry[] = files.map((f) => ({
      path: relativeName(f.name, dir),
      size: f.size,
      contentType: f.contentType,
      lastModified: f.lastModified?.toISOString()
    }));

    skills.set(dir, {
      id: dir,
      category,
      directoryName,
      metadata,
      hasMetadataFile: Boolean(ymlBlob),
      metadataError: error,
      files: fileEntries
    });
  }

  return { skills, builtAt: Date.now() };
}

function groupByDirectory(blobs: BlobEntry[]): Map<string, BlobEntry[]> {
  const map = new Map<string, BlobEntry[]>();
  for (const b of blobs) {
    const slash = b.name.lastIndexOf('/');
    if (slash <= 0) continue; // top-level files are ignored — every skill must live in a directory
    const dir = b.name.slice(0, slash);
    const list = map.get(dir);
    if (list) list.push(b);
    else map.set(dir, [b]);
  }
  return map;
}

function relativeName(blobName: string, dir: string): string {
  return blobName.slice(dir.length + 1);
}

export function toSummary(detail: SkillDetail): SkillSummary {
  const { files: _files, ...rest } = detail;
  return rest;
}

export function blobPathFor(skillId: string, relativePath: string): string {
  return `${skillId}/${relativePath}`;
}
