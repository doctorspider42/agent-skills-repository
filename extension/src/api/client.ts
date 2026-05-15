import axios, { AxiosInstance, AxiosError } from 'axios';
import { SkillDetail, SkillSummary } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
  }
}

export class SkillsApiClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, apiKey: string, timeoutMs: number) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: { 'x-api-key': apiKey, accept: 'application/json' },
      maxRedirects: 0, // do not silently follow a 302 to a login page on the wrong host
      // we read binary blobs for downloads — overridden per call
      responseType: 'json'
    });
  }

  async verify(): Promise<void> {
    try {
      const res = await this.http.get<{ ok?: boolean }>('/auth/verify');
      if (!res.data || res.data.ok !== true) {
        throw new ApiError(
          'Endpoint /auth/verify did not return {"ok":true}. Wrong URL — is something else running on this host?'
        );
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw toApiError(err, 'Connection test failed');
    }
  }

  async listSkills(refresh = false): Promise<SkillSummary[]> {
    try {
      const res = await this.http.get<{ skills: SkillSummary[] }>('/skills', {
        params: refresh ? { refresh: 1 } : undefined
      });
      if (!res.data || !Array.isArray(res.data.skills)) {
        throw new ApiError(
          `Unexpected response from /skills (no 'skills' array). Got: ${truncate(JSON.stringify(res.data))}`
        );
      }
      return res.data.skills;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw toApiError(err, 'Failed to list skills');
    }
  }

  async getSkill(id: string): Promise<SkillDetail> {
    try {
      const res = await this.http.get<SkillDetail>(`/skills/${encodeURIComponent(id)}`);
      return res.data;
    } catch (err) {
      throw toApiError(err, `Failed to fetch skill ${id}`);
    }
  }

  async downloadSkillZip(id: string): Promise<Buffer> {
    try {
      const res = await this.http.get<ArrayBuffer>(
        `/skills/${encodeURIComponent(id)}/download`,
        { responseType: 'arraybuffer' }
      );
      return Buffer.from(res.data);
    } catch (err) {
      throw toApiError(err, `Failed to download skill ${id}`);
    }
  }
}

function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + '…';
}

function toApiError(err: unknown, fallback: string): ApiError {
  const ax = err as AxiosError<{ error?: string; message?: string }>;
  if (ax?.isAxiosError) {
    const status = ax.response?.status;
    const code = ax.response?.data?.error;
    const detail = ax.response?.data?.message;
    if (status === 401) {
      return new ApiError('API key was rejected (401).', status, code);
    }
    const reason = detail || code || ax.message;
    return new ApiError(`${fallback}: ${reason}`, status, code);
  }
  return new ApiError(`${fallback}: ${(err as Error).message}`);
}
