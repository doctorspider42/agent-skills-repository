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

export type AgentMetadata = SkillMetadata;
export type AgentFileEntry = SkillFileEntry;

export interface AgentSummary {
  id: string;
  category: string[];
  directoryName: string;
  metadata: AgentMetadata;
  hasMetadataFile: boolean;
  metadataError?: string;
}

export interface AgentDetail extends AgentSummary {
  files: AgentFileEntry[];
}

export const UNKNOWN = 'unknown';
