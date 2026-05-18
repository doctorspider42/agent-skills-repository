import { Request, Response, NextFunction } from 'express';
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTPayload,
  errors as joseErrors
} from 'jose';
import { config } from './config';

export interface AuthedUser {
  mode: 'apikey' | 'entra';
  // entra-only — undefined when authenticated via api key
  oid?: string;
  tid?: string;
  email?: string;
  name?: string;
  scopes?: string[];
  roles?: string[];
  raw?: JWTPayload;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const validKeys = new Set(config.apiKeys);

const jwks =
  config.entra.jwksUri.length > 0
    ? createRemoteJWKSet(new URL(config.entra.jwksUri), {
        cooldownDuration: 30_000,
        cacheMaxAge: 24 * 60 * 60 * 1000
      })
    : undefined;

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.header('x-api-key');
  const bearer = extractBearer(req.header('authorization'));

  // Heuristic: a Bearer value that *looks like* a JWT (three dot-separated parts) is
  // treated as Entra; anything else from x-api-key or Bearer is treated as API key.
  const looksLikeJwt = bearer && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(bearer);

  if (config.authMode !== 'apikey' && looksLikeJwt) {
    verifyEntraToken(bearer!)
      .then((user) => {
        req.user = user;
        next();
      })
      .catch((err) => {
        // In 'both' mode, fall through to api-key only if no api-key header was sent
        if (config.authMode === 'both' && (apiKeyHeader || bearer)) {
          if (tryApiKey(req, apiKeyHeader, bearer)) return next();
        }
        respondUnauthorized(res, err);
      });
    return;
  }

  if (config.authMode !== 'entra' && (apiKeyHeader || bearer)) {
    if (tryApiKey(req, apiKeyHeader, bearer)) return next();
  }

  res.status(401).json({
    error: 'unauthorized',
    message:
      config.authMode === 'entra'
        ? 'Missing or invalid Bearer JWT (Entra ID).'
        : config.authMode === 'apikey'
          ? 'Missing or invalid API key.'
          : 'Missing credentials — provide either x-api-key or Authorization: Bearer <JWT>.'
  });
}

function tryApiKey(req: Request, apiKeyHeader: string | undefined, bearer: string | undefined): boolean {
  const candidate = apiKeyHeader || bearer;
  if (candidate && validKeys.has(candidate)) {
    req.user = { mode: 'apikey' };
    return true;
  }
  return false;
}

async function verifyEntraToken(token: string): Promise<AuthedUser> {
  if (!jwks) {
    throw new Error('Entra auth is not configured on the server.');
  }
  const { payload } = await jwtVerify(token, jwks, {
    audience: config.entra.audience,
    issuer: undefined, // verified manually below to support multi-tenant
    algorithms: ['RS256'],
    clockTolerance: config.entra.clockToleranceSeconds
  });

  // Issuer validation — support a single tenant by default, or an allow-list.
  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  const allowedIssuers =
    config.entra.allowedTenants.length > 0
      ? config.entra.allowedTenants.map(
          (t) => `https://login.microsoftonline.com/${t}/v2.0`
        )
      : [config.entra.issuer];
  if (!allowedIssuers.includes(iss)) {
    throw new Error(`Issuer '${iss}' is not in the allow list.`);
  }

  // Scope validation (delegated permissions). For app-only tokens, 'roles' is used.
  const scp = typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
  const roles = Array.isArray(payload.roles)
    ? (payload.roles as string[])
    : [];

  if (config.entra.requiredScope) {
    const hasScope = scp.includes(config.entra.requiredScope);
    const hasRole = roles.includes(config.entra.requiredScope);
    if (!hasScope && !hasRole) {
      throw new Error(
        `Token is missing required scope/role '${config.entra.requiredScope}'.`
      );
    }
  }

  return {
    mode: 'entra',
    oid: typeof payload.oid === 'string' ? payload.oid : undefined,
    tid: typeof payload.tid === 'string' ? payload.tid : undefined,
    email:
      (typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : undefined) ||
      (typeof payload.upn === 'string' ? payload.upn : undefined) ||
      (typeof payload.email === 'string' ? payload.email : undefined),
    name: typeof payload.name === 'string' ? payload.name : undefined,
    scopes: scp,
    roles,
    raw: payload
  };
}

function respondUnauthorized(res: Response, err: unknown): void {
  let message = 'Token verification failed.';
  if (err instanceof joseErrors.JWTExpired) {
    message = 'Token has expired.';
  } else if (err instanceof joseErrors.JWTClaimValidationFailed) {
    message = `Token claim invalid: ${err.claim} — ${err.reason}`;
  } else if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    message = 'Token signature invalid.';
  } else if (err instanceof Error) {
    message = err.message;
  }
  res.status(401).json({ error: 'unauthorized', message });
}

function extractBearer(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim();
}

// Back-compat alias so existing route imports keep working.
export const apiKeyAuth = authMiddleware;
