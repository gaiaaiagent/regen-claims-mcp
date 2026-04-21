/**
 * HTTP client for the Regen Claims Engine backend (koi-processor /claims/* API).
 *
 * Auth: uses KOI_API_KEY if set (bearer). Otherwise anonymous (read-only ops only).
 * Endpoint: defaults to https://regen.gaiaai.xyz (public production).
 *           Override with KOI_API_ENDPOINT for localhost or staging.
 */

import axios from 'axios';

type AxiosClient = ReturnType<typeof axios.create>;

let cached: AxiosClient | null = null;

export function getClient(): AxiosClient {
  if (cached) return cached;

  const baseURL = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz';
  const apiKey = process.env.KOI_API_KEY || '';
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

  // Auth layers are independent:
  //  - Basic (KOI_BASIC_AUTH_USER/PASS) — transport-layer, gates the nginx
  //    /claims location. Required to reach the backend at all while the
  //    dogfood demo is gated.
  //  - Bearer (KOI_API_KEY) — app-layer, authorizes write operations in the
  //    koi-processor dual-auth middleware. Read ops work without it.
  // Both can (and in production usually should) be set together.
  if (basicUser && basicPass) {
    config.auth = { username: basicUser, password: basicPass };
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  cached = axios.create(config);
  return cached;
}
