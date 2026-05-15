import dotenv from 'dotenv';

dotenv.config();

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim() || '';
const account = process.env.AZURE_STORAGE_ACCOUNT?.trim() || '';
const accountKey = process.env.AZURE_STORAGE_KEY?.trim() || '';

if (!connectionString && !(account && accountKey)) {
  throw new Error(
    'Azure Storage not configured. Set AZURE_STORAGE_CONNECTION_STRING, ' +
      'or both AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY.'
  );
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  apiKeys: required('API_KEYS', process.env.API_KEYS)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
  azure: {
    connectionString,
    account,
    accountKey,
    container: process.env.AZURE_STORAGE_CONTAINER?.trim() || 'skills',
    apiVersion: process.env.AZURE_STORAGE_API_VERSION?.trim() || ''
  },
  cacheTtlSeconds: Number(process.env.CATALOGUE_TTL_SECONDS ?? 60)
};
