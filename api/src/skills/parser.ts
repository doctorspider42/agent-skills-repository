import yaml from 'js-yaml';
import { SkillMetadata, UNKNOWN } from '../types';

export interface ParsedMetadata {
  metadata: SkillMetadata;
  error?: string;
}

export function parseSkillYml(
  raw: string | undefined,
  fallbackName: string
): ParsedMetadata {
  if (raw === undefined) {
    return {
      metadata: {
        name: fallbackName || UNKNOWN,
        version: UNKNOWN,
        author: UNKNOWN
      }
    };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
  } catch (err) {
    return {
      metadata: {
        name: fallbackName || UNKNOWN,
        version: UNKNOWN,
        author: UNKNOWN
      },
      error: `yaml parse error: ${(err as Error).message}`
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      metadata: {
        name: fallbackName || UNKNOWN,
        version: UNKNOWN,
        author: UNKNOWN
      },
      error: 'skill.yml is empty or not an object'
    };
  }

  const obj = parsed as Record<string, unknown>;
  const metadata: SkillMetadata = {
    name: str(obj.name) ?? fallbackName ?? UNKNOWN,
    version: str(obj.version) ?? UNKNOWN,
    author: str(obj.author) ?? UNKNOWN,
    description: str(obj.description),
    tags: stringArray(obj.tags),
    homepage: str(obj.homepage),
    minClaudeVer: str(obj.minClaudeVer)
  };

  return { metadata };
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number') return String(v);
  return undefined;
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const arr = v.filter((x): x is string => typeof x === 'string');
  return arr.length ? arr : undefined;
}
