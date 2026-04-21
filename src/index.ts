#!/usr/bin/env node
/**
 * Regen Claims MCP Server
 *
 * Exposes the Regen Network Claims Engine as Model Context Protocol tools:
 *   - Claims CRUD (create, search, get, verify, extract, link_evidence)
 *   - On-chain anchoring (anchor_claim, reconcile_claim, get_proof_pack)
 *   - Peer-review attestations (create, list, get, anchor, reconcile)
 *   - Commitments (draft_commitment_from_text, suggest_pool_routes)
 *
 * Backend: koi-processor /claims/* and /commitments/* REST API.
 * Default: https://regen.gaiaai.xyz (override with KOI_API_ENDPOINT).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { TOOL_DEFINITIONS, dispatchTool } from './tools.js';

dotenv.config();

const SERVER_NAME = process.env.MCP_SERVER_NAME || 'regen-claims';
const SERVER_VERSION = process.env.MCP_SERVER_VERSION || '0.1.0';

const ENABLED = process.env.CLAIMS_ENABLED_TOOLS
  ? new Set(process.env.CLAIMS_ENABLED_TOOLS.split(',').map((t) => t.trim()).filter(Boolean))
  : null;
const DISABLED = new Set(
  (process.env.CLAIMS_DISABLED_TOOLS || '').split(',').map((t) => t.trim()).filter(Boolean),
);

function isEnabled(name: string): boolean {
  if (ENABLED) return ENABLED.has(name);
  return !DISABLED.has(name);
}

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS.filter((t) => isEnabled(t.name)),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!isEnabled(name)) {
    return {
      content: [{ type: 'text' as const, text: `Tool disabled via CLAIMS_DISABLED_TOOLS / CLAIMS_ENABLED_TOOLS: ${name}` }],
      isError: true,
    };
  }
  try {
    return await dispatchTool(name, (args || {}) as Record<string, unknown>);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpErr = err as any;
    const status = httpErr?.response?.status;
    const detail = httpErr?.response?.data
      ? `\n\nBackend response: ${JSON.stringify(httpErr.response.data, null, 2)}`
      : '';

    // Friendly 401 message — point to the shared auth flow.
    if (status === 401) {
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `${name} returned 401 Unauthorized.\n\n` +
              `This usually means one of:\n` +
              `  • HTTP basic-auth creds missing or wrong — set KOI_BASIC_AUTH_USER / KOI_BASIC_AUTH_PASS (ask Darren or Gregory for team creds).\n` +
              `  • Write operation needs an OAuth Bearer token — run \`regen_koi_authenticate\` in the regen-koi-mcp plugin (sign in with your @regen.network email). The resulting token is shared at ~/.koi-auth.json and picked up automatically.\n` +
              `  • Both may be needed in production.\n\n` +
              `Run \`auth_status\` to see the current state.${detail}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Error calling ${name}: ${message}${detail}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[${SERVER_NAME}] v${SERVER_VERSION} ready (${TOOL_DEFINITIONS.filter((t) => isEnabled(t.name)).length} tools)\n`);
