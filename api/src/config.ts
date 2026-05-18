import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || '';
const account = process.env.AZURE_STORAGE_ACCOUNT?.trim() || '';
const accountKey = process.env.AZURE_STORAGE_KEY?.trim() || '';

if (!connectionString && !(account && accountKey)) {
  throw new Error(
    'Azure Storage not configured. Set AZURE_STORAGE_CONNECTION_STRING, ' +
      'or both AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY.'
  );
}

const rawAuthMode = (process.env.AUTH_MODE?.trim().toLowerCase() || 'apikey') as
  | 'apikey'
  | 'entra'
  | 'both';
if (!['apikey', 'entra', 'both'].includes(rawAuthMode)) {
  throw new Error(`Invalid AUTH_MODE='${rawAuthMode}'. Use apikey | entra | both.`);
}

const apiKeys = (process.env.API_KEYS ?? '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if ((rawAuthMode === 'apikey' || rawAuthMode === 'both') && apiKeys.length === 0) {
  throw new Error(
    `AUTH_MODE='${rawAuthMode}' requires API_KEYS to be set (comma-separated list).`
  );
}

const entraTenantId = process.env.ENTRA_TENANT_ID?.trim() || '';
const entraAudience = process.env.ENTRA_API_AUDIENCE?.trim() || '';
const entraIssuer = process.env.ENTRA_ISSUER?.trim() || '';
const entraRequiredScope = process.env.ENTRA_REQUIRED_SCOPE?.trim() || '';
const entraAllowedTenants = (process.env.ENTRA_ALLOWED_TENANTS ?? entraTenantId)
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (rawAuthMode === 'entra' || rawAuthMode === 'both') {
  if (!entraTenantId) {
    throw new Error(`AUTH_MODE='${rawAuthMode}' requires ENTRA_TENANT_ID.`);
  }
  if (!entraAudience) {
    throw new Error(
      `AUTH_MODE='${rawAuthMode}' requires ENTRA_API_AUDIENCE (e.g. api://<api-app-id>).`
    );
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  authMode: rawAuthMode,
  apiKeys,
  entra: {
    tenantId: entraTenantId,
    audience: entraAudience,
    issuer:
      entraIssuer ||
      (entraTenantId ? `https://login.microsoftonline.com/${entraTenantId}/v2.0` : ''),
    requiredScope: entraRequiredScope,
    allowedTenants: entraAllowedTenants,
    jwksUri: entraTenantId
      ? `https://login.microsoftonline.com/${entraTenantId}/discovery/v2.0/keys`
      : '',
    clockToleranceSeconds: Number(process.env.ENTRA_CLOCK_TOLERANCE_SECONDS ?? 300)
  },
  azure: {
    connectionString,
    account,
    accountKey,
    container: process.env.AZURE_STORAGE_CONTAINER?.trim() || 'skills',
    agentsContainer: process.env.AZURE_STORAGE_AGENTS_CONTAINER?.trim() || 'agents',
    apiVersion: process.env.AZURE_STORAGE_API_VERSION?.trim() || ''
  },
  cacheTtlSeconds: Number(process.env.CATALOGUE_TTL_SECONDS ?? 60)
};
