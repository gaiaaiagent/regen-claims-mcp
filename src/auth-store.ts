/**
 * Auth State Reader
 *
 * Shared token file: ~/.koi-auth.json
 *
 * regen-claims-mcp is a CONSUMER of this file, not a writer. Users obtain
 * their access_token via regen-koi-mcp's `regen_koi_authenticate` tool
 * (RFC 8628 device code flow against https://regen.gaiaai.xyz/auth/*).
 * This MCP just reads the resulting Bearer token and attaches it to
 * outbound requests.
 *
 * If the user isn't authenticated, reads will still work through the
 * nginx basic-auth gate (KOI_BASIC_AUTH_USER/PASS), but writes will 401
 * at the koi-processor dual-auth middleware. The 401 handler in client.ts
 * tells the user to run regen_koi_authenticate.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const AUTH_FILE = path.join(os.homedir(), '.koi-auth.json');

export interface AuthState {
  accessToken?: string;
  accessTokenExpiresAt?: number; // Unix timestamp (ms)
  userEmail?: string;
}

export function loadAuthState(): AuthState {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const data = fs.readFileSync(AUTH_FILE, 'utf8');
      return JSON.parse(data) as AuthState;
    }
  } catch {
    // swallow — returning empty is the correct behavior for a missing/invalid file
  }
  return {};
}

export function hasValidAccessToken(state: AuthState): boolean {
  if (!state.accessToken || !state.accessTokenExpiresAt) return false;
  return Date.now() < state.accessTokenExpiresAt;
}

/**
 * Returns the current Bearer token if one exists and isn't expired.
 * null otherwise (caller falls back to KOI_API_KEY env or no auth).
 */
export function readSharedBearer(): { token: string; email?: string; expiresAt: number } | null {
  const state = loadAuthState();
  if (!hasValidAccessToken(state)) return null;
  return {
    token: state.accessToken!,
    email: state.userEmail,
    expiresAt: state.accessTokenExpiresAt!,
  };
}

export { AUTH_FILE };
