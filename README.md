# regen-claims-mcp

Model Context Protocol server for the **Regen Network Claims Engine**. Lets Claude (or any MCP-compatible agent) create, review, attest, and anchor impact claims on the Regen Ledger.

**Live dashboard:** https://regen.gaiaai.xyz/claims
**Dogfooding guide:** [koi-processor/docs/claims/dogfooding-guide.md](https://github.com/gaiaaiagent/koi-processor/blob/regen-prod/docs/claims/dogfooding-guide.md)

## What's a claim?

A structured assertion like *"Organization X restored 500 hectares of mangrove habitat"* — with evidence links, peer attestations, and optional on-chain anchoring for verifiability. Claims progress through verification levels:

```
self_reported → peer_reviewed → verified → ledger_anchored
```

## Tools

### Meta
- `auth_status` — show current endpoint and Bearer token state

### Claims CRUD
- `create_claim` — create a new impact claim
- `search_claims` — filter by verification level, type, claimant, or subject
- `get_claim` — fetch a single claim by RID (with linked evidence)
- `verify_claim` — advance verification level
- `extract_claims` — AI extraction from document text
- `link_evidence` — attach evidence entity to a claim

### On-chain
- `anchor_claim` — broadcast MsgAnchor to Regen Ledger
- `reconcile_claim` — check on-chain status of a pending anchor
- `get_proof_pack` — verification bundle (hash + ledger IRI + tx hash)

### Attestations (peer review)
- `create_attestation` — reviewer vouches for / against a claim
- `list_attestations` / `get_attestation` — read attestations
- `anchor_attestation` / `reconcile_attestation` — on-chain anchoring

### Commitments (hackathon extension)
- `draft_commitment_from_text` — LLM-parse natural-language commitments
- `suggest_pool_routes` — score pool matches for a commitment

## Install

```bash
npm install -g regen-claims-mcp
```

Or run straight from source:

```bash
git clone https://github.com/gaiaaiagent/regen-claims-mcp.git
cd regen-claims-mcp
npm install
npm run build
```

## Configure in Claude Code

Add to your Claude Code MCP config (or use `/mcp add`):

```json
{
  "mcpServers": {
    "regen-claims": {
      "command": "npx",
      "args": ["-y", "regen-claims-mcp"],
      "env": {
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz"
      }
    }
  }
}
```

That's it. If you've already authenticated in `regen-koi-mcp` (via `regen_koi_authenticate`), this MCP picks up your token automatically from `~/.koi-auth.json`. Reads work without any auth.

## Auth

A single mechanism: **OAuth Bearer token, scoped to `@regen.network` emails, issued via RFC 8628 device-code flow.**

The same token works for:
- The `regen-claims-mcp` MCP (this package)
- The `regen-koi-mcp` MCP (knowledge search)
- The browser portal at [regen.gaiaai.xyz/claims](https://regen.gaiaai.xyz/claims) (delivered as an HttpOnly session cookie)

### Getting a token (once)

```
# In Claude Code:
regen_koi_authenticate   (tool from regen-koi-mcp)

# Follow the prompts:
# 1. Open https://regen.gaiaai.xyz/activate
# 2. Enter the code shown
# 3. Sign in with @regen.network
```

Token is stored at `~/.koi-auth.json` (mode 0600). `regen-claims-mcp` reads it automatically on every request — no restart needed after authenticating.

### What requires auth

- **Read endpoints** (`search_claims`, `get_claim`, `list_attestations`, `get_attestation`, `get_proof_pack`) — **open, no auth needed**
- **Write endpoints** (`create_claim`, `verify_claim`, `link_evidence`, `anchor_claim`, `reconcile_claim`, `extract_claims`, `create_attestation`, `anchor_attestation`, `reconcile_attestation`, commitments) — **require a valid Bearer token**

### Service tokens (backend-to-backend)

For CI jobs or scheduled processes without an interactive OAuth identity, set a fixed service token on the backend (`KOI_CLAIMS_SERVICE_TOKEN` env var on the koi-processor host) and pass it via `KOI_API_KEY`:

```json
{ "env": { "KOI_API_KEY": "<service-token>" } }
```

When `KOI_API_KEY` is set, it overrides the shared OAuth token from `~/.koi-auth.json`. Writes authenticated this way are attributed to `service:claims-service` in the audit trail.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `KOI_API_ENDPOINT` | `https://regen.gaiaai.xyz` | Claims API base URL |
| `KOI_API_KEY` | *(empty)* | Bearer override (service tokens). Takes precedence over `~/.koi-auth.json` |
| `OPENAI_API_KEY` | *(empty)* | Required only for `draft_commitment_from_text` |
| `CLAIMS_ENABLED_TOOLS` | *(unset)* | Whitelist (CSV). If set, only these tools load |
| `CLAIMS_DISABLED_TOOLS` | *(empty)* | Blacklist (CSV) |
| `MCP_SERVER_NAME` | `regen-claims` | Override MCP server identity |
| `MCP_SERVER_VERSION` | *package.json* | Override version reported to MCP clients |

## Backend

All tools are thin HTTP wrappers around the `koi-processor` `/claims/*` and `/commitments/*` REST API. Backend source + contract tests: [gaiaaiagent/koi-processor](https://github.com/gaiaaiagent/koi-processor). OpenAPI: fetch `/claims/openapi.json` on the prod host.

## Related packages

- **[regen-koi-mcp](https://github.com/gaiaaiagent/regen-koi-mcp)** — KOI knowledge search, entity resolution, SPARQL. **Source of truth for authentication** (`regen_koi_authenticate` tool).
- **[regen-python-mcp](https://github.com/gaiaaiagent/regen-python-mcp)** — Regen Ledger read-only queries (balances, governance, ecocredits)
- **[personal-koi-mcp](https://github.com/gaiaaiagent/personal-koi-mcp)** — Darren's personal workflow stack (vault, tasks, sessions, Graphiti) — **not intended for team use**

## License

MIT
