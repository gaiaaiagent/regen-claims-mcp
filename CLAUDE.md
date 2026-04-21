# regen-claims-mcp — Claude Code Instructions

## What this repo is

Thin MCP server wrapping the Regen Claims Engine REST API (`koi-processor` backend). Purpose: let Claude Code agents create/review/attest/anchor claims without installing Darren's full personal MCP stack.

## Scope boundary

**In scope:**
- Claims CRUD (`create_claim`, `search_claims`, `get_claim`, `verify_claim`, `extract_claims`, `link_evidence`)
- On-chain anchoring (`anchor_claim`, `reconcile_claim`, `get_proof_pack`)
- Attestations (`create_attestation`, `list_attestations`, `get_attestation`, `anchor_attestation`, `reconcile_attestation`)
- Commitments (`draft_commitment_from_text`, `suggest_pool_routes`) — hackathon extension, stays for now

**Out of scope — belongs elsewhere:**
- Knowledge search / entity resolution / SPARQL → `regen-koi-mcp`
- Ledger read-only queries (balances, governance, ecocredits) → `regen-python-mcp`
- Personal workflow (vault, tasks, sessions, Graphiti, commons intake) → `personal-koi-mcp`
- Backend endpoint management / HTTP client pool → backend team, not the MCP

## When adding tools

1. Does it wrap a `koi-processor` `/claims/*` or `/commitments/*` endpoint? → Add here.
2. Does it need more than a thin HTTP wrapper (LLM calls, local state, heavy computation)? → Consider if this belongs in the backend first.
3. Does it reference `vault_*`, `task_*`, `session_*`, `koi_query` — anything Darren-personal? → Belongs in `personal-koi-mcp`, not here.

## Code pattern

- Keep `tools.ts` flat: one `TOOL_DEFINITIONS` array + one `dispatchTool(name, args)` switch. No class hierarchy.
- HTTP client is a singleton in `client.ts`. Auth via `KOI_API_KEY` bearer.
- Never hardcode URLs — always read `KOI_API_ENDPOINT` from env. Default is `https://regen.gaiaai.xyz` (public production).
- Pending-anchor pattern (202 response): return a `⏳ Anchor pending` message with a pointer to the reconcile tool.

## Backend endpoint reference

Live list: `https://regen.gaiaai.xyz/claims/openapi.json` (or ask the backend docs in `koi-processor/api/routers/claims_router.py`).

## Publishing

- `npm run build` → `dist/`
- `npm publish` publishes to the public registry under `regen-claims-mcp`
- `prepublishOnly` cleans + builds
- Bump version in `package.json` before publishing

## Testing

- Read-only smoke: `search_claims`, `get_claim` against production (no auth needed).
- Write-path smoke: use a dev backend instance with `KOI_API_ENDPOINT=http://localhost:8351`.
- Do NOT smoke-test `anchor_claim` against prod unless coordinated — it spends real regen gas.
