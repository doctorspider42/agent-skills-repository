import { agentsContainerClient, downloadBlobToBuffer, listAllBlobs, BlobEntry } from '../azure/blobClient';
import { AgentDetail, AgentFileEntry, AgentSummary } from '../types';
import { parseSkillYml } from '../skills/parser';
import { config } from '../config';

const METADATA_FILE = 'agent.yml';

interface CatalogueCache {
  agents: Map<string, AgentDetail>;
  builtAt: number;
}

let cache: CatalogueCache | null = null;
let inflight: Promise<CatalogueCache> | null = null;

export async function getCatalogue(force = false): Promise<Map<string, AgentDetail>> {
  if (!force && cache && fresh(cache)) {
    return cache.agents;
  }
  if (inflight) return (await inflight).agents;

  inflight = build().finally(() => {
    inflight = null;
  });
  cache = await inflight;
  return cache.agents;
}

function fresh(c: CatalogueCache): boolean {
  if (config.cacheTtlSeconds <= 0) return false;
  return Date.now() - c.builtAt < config.cacheTtlSeconds * 1000;
}

async function build(): Promise<CatalogueCache> {
  const blobs = await listAllBlobs(undefined, agentsContainerClient);
  const byDir = groupByDirectory(blobs);

  const agents = new Map<string, AgentDetail>();

  for (const [dir, files] of byDir) {
    const segments = dir.split('/').filter(Boolean);
    const directoryName = segments[segments.length - 1] ?? dir;
    const markerName = `${directoryName}.md`;

    const hasAgentFile = files.some((f) => relativeName(f.name, dir) === markerName);
    if (!hasAgentFile) continue;

    const ymlBlob = files.find((f) => relativeName(f.name, dir) === METADATA_FILE);
    let rawYml: string | undefined;
    if (ymlBlob) {
      try {
        const buf = await downloadBlobToBuffer(ymlBlob.name, agentsContainerClient);
        rawYml = buf.toString('utf8');
      } catch (err) {
        rawYml = undefined;
      }
    }

    const category = segments.slice(0, -1);

    const { metadata, error } = parseSkillYml(rawYml, directoryName);

    const fileEntries: AgentFileEntry[] = files.map((f) => ({
      path: relativeName(f.name, dir),
      size: f.size,
      contentType: f.contentType,
      lastModified: f.lastModified?.toISOString()
    }));

    agents.set(dir, {
      id: dir,
      category,
      directoryName,
      metadata,
      hasMetadataFile: Boolean(ymlBlob),
      metadataError: error,
      files: fileEntries
    });
  }

  return { agents, builtAt: Date.now() };
}

function groupByDirectory(blobs: BlobEntry[]): Map<string, BlobEntry[]> {
  const map = new Map<string, BlobEntry[]>();
  for (const b of blobs) {
    const slash = b.name.lastIndexOf('/');
    if (slash <= 0) continue;
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

export function toSummary(detail: AgentDetail): AgentSummary {
  const { files: _files, ...rest } = detail;
  return rest;
}

export function blobPathFor(agentId: string, relativePath: string): string {
  return `${agentId}/${relativePath}`;
}
