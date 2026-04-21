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

  // Bearer (API key) and Basic (demo gate) are layered: Basic at the nginx
  // layer gates access to the /claims API, Bearer at the app layer
  // authorizes write operations. Both may be needed in production.
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (basicUser && basicPass) {
    config.auth = { username: basicUser, password: basicPass };
  } else if (basicUser && basicPass && apiKey) {
    // Both: Basic on the transport, Bearer on the app. axios.auth sets Basic,
    // header.Authorization sets Bearer — but nginx strips Basic before proxy
    // in most configs, so keep them separate. If this combination breaks,
    // fall back to manually computing both and picking one.
    config.auth = { username: basicUser, password: basicPass };
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  cached = axios.create(config);
  return cached;
}
