import {
  AnonymousCredential,
  BaseRequestPolicy,
  BlobServiceClient,
  ContainerClient,
  HttpOperationResponse,
  RequestPolicy,
  RequestPolicyFactory,
  RequestPolicyOptions,
  StorageSharedKeyCredential,
  WebResource,
  newPipeline
} from '@azure/storage-blob';
import { config } from '../config';

/**
 * Policy that overrides the `x-ms-version` request header. Needed when talking
 * to a version of Azurite older than the bundled SDK — the SDK ships with the
 * latest service API version, which Azurite may not yet support.
 */
class XMsVersionOverridePolicy extends BaseRequestPolicy {
  constructor(
    nextPolicy: RequestPolicy,
    options: RequestPolicyOptions,
    private readonly version: string
  ) {
    super(nextPolicy, options);
  }

  async sendRequest(request: WebResource): Promise<HttpOperationResponse> {
    request.headers.set('x-ms-version', this.version);
    return this._nextPolicy.sendRequest(request);
  }
}

function versionOverrideFactory(version: string): RequestPolicyFactory {
  return {
    create: (nextPolicy, options) =>
      new XMsVersionOverridePolicy(nextPolicy, options, version)
  };
}

interface ParsedConnectionString {
  account: string;
  accountKey: string;
  blobEndpoint: string;
}

/**
 * Connection-string parser sufficient for the keys we care about. Handles the
 * AccountKey value containing `=` padding by splitting on the first `=` only.
 */
function parseConnectionString(cs: string): ParsedConnectionString {
  const parts = new Map<string, string>();
  for (const segment of cs.split(';')) {
    const eq = segment.indexOf('=');
    if (eq <= 0) continue;
    parts.set(segment.slice(0, eq).trim(), segment.slice(eq + 1).trim());
  }
  const account = parts.get('AccountName') ?? '';
  const accountKey = parts.get('AccountKey') ?? '';
  const protocol = parts.get('DefaultEndpointsProtocol') ?? 'https';
  const suffix = parts.get('EndpointSuffix') ?? 'core.windows.net';
  const blobEndpoint =
    parts.get('BlobEndpoint') ?? `${protocol}://${account}.blob.${suffix}`;
  return { account, accountKey, blobEndpoint };
}

function buildContainerClient(): ContainerClient {
  const { connectionString, account, accountKey, container, apiVersion } = config.azure;

  // Fast path: no version pinning needed and the SDK already handles connection
  // strings — let it do the work.
  if (!apiVersion && connectionString) {
    return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(container);
  }

  let url: string;
  let credential: StorageSharedKeyCredential | AnonymousCredential;

  if (connectionString) {
    const parsed = parseConnectionString(connectionString);
    url = parsed.blobEndpoint;
    credential = parsed.accountKey
      ? new StorageSharedKeyCredential(parsed.account, parsed.accountKey)
      : new AnonymousCredential();
  } else {
    url = `https://${account}.blob.core.windows.net`;
    credential = new StorageSharedKeyCredential(account, accountKey);
  }

  const pipeline = newPipeline(credential);
  if (apiVersion) {
    pipeline.factories.unshift(versionOverrideFactory(apiVersion));
  }

  return new BlobServiceClient(url, pipeline).getContainerClient(container);
}

export const containerClient = buildContainerClient();

export interface BlobEntry {
  name: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
}

export async function listAllBlobs(prefix?: string): Promise<BlobEntry[]> {
  const entries: BlobEntry[] = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    entries.push({
      name: blob.name,
      size: blob.properties.contentLength ?? 0,
      contentType: blob.properties.contentType ?? undefined,
      lastModified: blob.properties.lastModified
    });
  }
  return entries;
}

export async function downloadBlobToBuffer(blobName: string): Promise<Buffer> {
  const blob = containerClient.getBlobClient(blobName);
  return blob.downloadToBuffer();
}

export function getBlobStream(blobName: string) {
  return containerClient.getBlobClient(blobName).download();
}

export async function blobExists(blobName: string): Promise<boolean> {
  return containerClient.getBlobClient(blobName).exists();
}
