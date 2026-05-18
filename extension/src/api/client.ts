import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { AgentDetail, AgentSummary, SkillDetail, SkillSummary } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
  }
}

export type AuthHeadersProvider = (
  options?: { forceRefresh?: boolean }
) => Promise<Record<string, string>>;

export interface VerifyResponse {
  ok?: boolean;
  user?: {
    mode?: 'apikey' | 'entra';
    email?: string;
    name?: string;
    tenantId?: string;
    scopes?: string[];
    roles?: string[];
  };
}

export class SkillsApiClient {
  private http: AxiosInstance;
  private readonly getAuthHeaders: AuthHeadersProvider;

  constructor(baseUrl: string, authHeaders: AuthHeadersProvider, timeoutMs: number) {
    this.getAuthHeaders = authHeaders;
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { accept: 'application/json' },
      maxRedirects: 0, // do not silently follow a 302 to a login page on the wrong host
      responseType: 'json'
    });

    this.http.interceptors.request.use(async (req) => {
      const headers = await this.getAuthHeaders();
      req.headers = req.headers ?? {};
      for (const [k, v] of Object.entries(headers)) {
        (req.headers as Record<string, string>)[k] = v;
      }
      return req;
    });
  }

  private async requestWithRetry<T>(cfg: AxiosRequestConfig): Promise<T> {
    try {
      const res = await this.http.request<T>(cfg);
      return res.data;
    } catch (err) {
      const ax = err as AxiosError;
      if (ax?.response?.status === 401) {
        // Try once more with a refreshed token (relevant for Entra; harmless for api key).
        const headers = await this.getAuthHeaders({ forceRefresh: true });
        const retry = await this.http.request<T>({
          ...cfg,
          headers: { ...(cfg.headers ?? {}), ...headers }
        });
        return retry.data;
      }
      throw err;
    }
  }

  async verify(): Promise<VerifyResponse> {
    try {
      const data = await this.requestWithRetry<VerifyResponse>({
        method: 'get',
        url: '/auth/verify'
      });
      if (!data || data.ok !== true) {
        throw new ApiError(
          'Endpoint /auth/verify did not return {"ok":true}. Wrong URL — is something else running on this host?'
        );
      }
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw toApiError(err, 'Connection test failed');
    }
  }

  async getMode(): Promise<{ authMode: 'apikey' | 'entra' | 'both' } | undefined> {
    try {
      const res = await this.http.get<{ authMode: 'apikey' | 'entra' | 'both' }>('/auth/mode');
      return res.data;
    } catch {
      // Older servers don't expose this — that's fine.
      return undefined;
    }
  }

  async listSkills(refresh = false): Promise<SkillSummary[]> {
    try {
      const data = await this.requestWithRetry<{ skills: SkillSummary[] }>({
        method: 'get',
        url: '/skills',
        params: refresh ? { refresh: 1 } : undefined
      });
      if (!data || !Array.isArray(data.skills)) {
        throw new ApiError(
          `Unexpected response from /skills (no 'skills' array). Got: ${truncate(JSON.stringify(data))}`
        );
      }
      return data.skills;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw toApiError(err, 'Failed to list skills');
    }
  }

  async getSkill(id: string): Promise<SkillDetail> {
    try {
      return await this.requestWithRetry<SkillDetail>({
        method: 'get',
        url: `/skills/${encodeSkillIdPath(id)}`
      });
    } catch (err) {
      throw toApiError(err, `Failed to fetch skill ${id}`);
    }
  }

  async downloadSkillZip(id: string): Promise<Buffer> {
    try {
      const data = await this.requestWithRetry<ArrayBuffer>({
        method: 'get',
        url: `/skills/${encodeSkillIdPath(id)}/download`,
        responseType: 'arraybuffer'
      });
      return Buffer.from(data);
    } catch (err) {
      throw toApiError(err, `Failed to download skill ${id}`);
    }
  }

  async getSkillFileText(id: string, relativePath: string): Promise<string> {
    try {
      const data = await this.requestWithRetry<ArrayBuffer>({
        method: 'get',
        url: `/skills/${encodeSkillIdPath(id)}/files/${encodeSkillIdPath(relativePath)}`,
        responseType: 'arraybuffer'
      });
      return Buffer.from(data).toString('utf8');
    } catch (err) {
      throw toApiError(err, `Failed to fetch ${relativePath} for skill ${id}`);
    }
  }

  async listAgents(refresh = false): Promise<AgentSummary[]> {
    try {
      const data = await this.requestWithRetry<{ agents: AgentSummary[] }>({
        method: 'get',
        url: '/agents',
        params: refresh ? { refresh: 1 } : undefined
      });
      if (!data || !Array.isArray(data.agents)) {
        throw new ApiError(
          `Unexpected response from /agents (no 'agents' array). Got: ${truncate(JSON.stringify(data))}`
        );
      }
      return data.agents;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw toApiError(err, 'Failed to list agents');
    }
  }

  async getAgent(id: string): Promise<AgentDetail> {
    try {
      return await this.requestWithRetry<AgentDetail>({
        method: 'get',
        url: `/agents/${encodeSkillIdPath(id)}`
      });
    } catch (err) {
      throw toApiError(err, `Failed to fetch agent ${id}`);
    }
  }

  async downloadAgentZip(id: string): Promise<Buffer> {
    try {
      const data = await this.requestWithRetry<ArrayBuffer>({
        method: 'get',
        url: `/agents/${encodeSkillIdPath(id)}/download`,
        responseType: 'arraybuffer'
      });
      return Buffer.from(data);
    } catch (err) {
      throw toApiError(err, `Failed to download agent ${id}`);
    }
  }

  async getAgentFileText(id: string, relativePath: string): Promise<string> {
    try {
      const data = await this.requestWithRetry<ArrayBuffer>({
        method: 'get',
        url: `/agents/${encodeSkillIdPath(id)}/files/${encodeSkillIdPath(relativePath)}`,
        responseType: 'arraybuffer'
      });
      return Buffer.from(data).toString('utf8');
    } catch (err) {
      throw toApiError(err, `Failed to fetch ${relativePath} for agent ${id}`);
    }
  }
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + '…';
}

function encodeSkillIdPath(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}

function toApiError(err: unknown, fallback: string): ApiError {
  const ax = err as AxiosError<{ error?: string; message?: string }>;
  if (ax?.isAxiosError) {
    const status = ax.response?.status;
    const code = ax.response?.data?.error;
    const detail = ax.response?.data?.message;
    if (status === 401) {
      return new ApiError(
        detail ?? 'API credentials rejected (401).',
        status,
        code
      );
    }
    const reason = detail || code || ax.message;
    return new ApiError(`${fallback}: ${reason}`, status, code);
  }
  return new ApiError(`${fallback}: ${(err as Error).message}`);
}
