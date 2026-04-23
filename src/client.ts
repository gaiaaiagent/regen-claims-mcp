/**
 * HTTP client for the Regen Claims Engine backend (koi-processor /claims/*).
 *
 * Three auth layers, all independent and potentially layered:
 *   1. HTTP basic (KOI_BASIC_AUTH_USER/PASS) — transport-layer nginx gate
 *      protecting the /claims location during the dogfood phase.
 *   2. Shared OAuth Bearer — read from ~/.koi-auth.json, populated by
 *      regen-koi-mcp's `regen_koi_authenticate` device-code flow against
 *      https://regen.gaiaai.xyz/auth/*. @regen.network emails only.
 *      Used for write operations.
 *   3. Bearer override (KOI_API_KEY) — for non-OAuth service tokens.
 *      Overrides #2 when set.
 *
 * The client rebuilds Bearer on every request so a freshly-issued token
 * (user just ran regen_koi_authenticate) is picked up without restarting
 * the MCP.
 */

import axios from 'axios';
import { readSharedBearer, AUTH_FILE } from './auth-store.js';

type AxiosClient = ReturnType<typeof axios.create>;

let cached: AxiosClient | null = null;

export function getClient(): AxiosClient {
  if (cached) return cached;

  const baseURL = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz';
  const basicUser = process.env.KOI_BASIC_AUTH_USER || '';
  const basicPass = process.env.KOI_BASIC_AUTH_PASS || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config: Parameters<typeof axios.create>[0] = {
    baseURL,
    headers,
    timeout: 60000,
  };

  if (basicUser && basicPass) {
    config.auth = { username: basicUser, password: basicPass };
  }

  cached = axios.create(config);

  // Attach current Bearer on every request (reads shared token file each time
  // so fresh logins are picked up without restarting the MCP).
  cached.interceptors.request.use((req) => {
    const envKey = process.env.KOI_API_KEY || '';
    const shared = envKey ? null : readSharedBearer();
    const bearer = envKey || shared?.token;
    if (bearer && req.headers) {
      req.headers.set
        ? req.headers.set('Authorization', `Bearer ${bearer}`)
        : ((req.headers as Record<string, string>)['Authorization'] = `Bearer ${bearer}`);
    }
    return req;
  });

  return cached;
}

/**
 * Human-readable summary of the current auth state. Useful for an
 * `auth_status` MCP tool or for debugging 401s.
 */
export function authStatus(): string {
  const parts: string[] = [];
  const basicUser = process.env.KOI_BASIC_AUTH_USER || '';
  const envKey = process.env.KOI_API_KEY || '';
  const shared = readSharedBearer();

  parts.push(`Endpoint: ${process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz'}`);
  parts.push(`Basic auth: ${basicUser ? `user=${basicUser}` : '(not set)'}`);

  if (envKey) {
    parts.push('Bearer: set via KOI_API_KEY env (overrides shared OAuth token)');
  } else if (shared) {
    const exp = new Date(shared.expiresAt).toLocaleString();
    parts.push(`Bearer: OAuth token for ${shared.email || 'unknown'} (expires ${exp})`);
  } else {
    parts.push(`Bearer: NOT authenticated — run \`regen_koi_authenticate\` in regen-koi-mcp to obtain a token (stored at ${AUTH_FILE})`);
  }

  return parts.join('\n');
}
