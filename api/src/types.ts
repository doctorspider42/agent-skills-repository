export interface SkillMetadata {
  name: string;
  version: string;
  author: string;
  description?: string;
  tags?: string[];
  homepage?: string;
  minClaudeVer?: string;
}

export interface SkillSummary {
  id: string;
  category: string[];
  directoryName: string;
  metadata: SkillMetadata;
  hasMetadataFile: boolean;
  metadataError?: string;
}

export interface SkillFileEntry {
  path: string;
  size: number;
  contentType?: string;
  lastModified?: string;
}

export interface SkillDetail extends SkillSummary {
  files: SkillFileEntry[];
}

export const UNKNOWN = 'unknown';
