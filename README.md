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
- `auth_status` — show current endpoint, basic-auth user, and Bearer token state

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
        "KOI_API_ENDPOINT": "https://regen.gaiaai.xyz",
        "KOI_BASIC_AUTH_USER": "<user>",
        "KOI_BASIC_AUTH_PASS": "<pass>",
        "KOI_API_KEY": ""
      }
    }
  }
}
```

> The production claims API is currently gated behind HTTP basic auth while the engine is in dogfood phase. Team creds are shared out-of-band (Signal / 1Password) — ask Darren or Gregory. `KOI_API_KEY` (Bearer) will be required for write operations once write-path auth is wired up on the backend.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `KOI_API_ENDPOINT` | `https://regen.gaiaai.xyz` | Claims API base URL |
| `KOI_API_KEY` | *(empty)* | Bearer token for write operations |
| `KOI_BASIC_AUTH_USER` | *(empty)* | HTTP basic-auth user (the demo is currently gated behind basic auth) |
| `KOI_BASIC_AUTH_PASS` | *(empty)* | HTTP basic-auth password |
| `OPENAI_API_KEY` | *(empty)* | Required only for `draft_commitment_from_text` |
| `CLAIMS_ENABLED_TOOLS` | *(unset)* | Whitelist (CSV). If set, only these tools load |
| `CLAIMS_DISABLED_TOOLS` | *(empty)* | Blacklist (CSV) |
| `MCP_SERVER_NAME` | `regen-claims` | Override MCP server identity |
| `MCP_SERVER_VERSION` | *package.json* | Override version reported to MCP clients |

## Auth

Three layers, all independent and potentially stacked:

1. **HTTP basic auth** (transport, via env) — nginx gate on the `/claims` location during the dogfood phase. Set `KOI_BASIC_AUTH_USER` + `KOI_BASIC_AUTH_PASS`. Ask Darren or Gregory for team creds (out-of-band).
2. **Shared OAuth Bearer** (app layer, via shared token file) — populated by `regen-koi-mcp`'s `regen_koi_authenticate` tool using an RFC 8628 device code flow against `https://regen.gaiaai.xyz/auth/*`. `@regen.network` emails only. Token is stored at `~/.koi-auth.json` (mode 0600) and **automatically picked up by this MCP** — no separate login needed.
3. **Bearer override** (app layer, via env) — set `KOI_API_KEY` for non-OAuth service tokens (CI, backend-to-backend). Overrides the shared token when set.

### Recommended team setup

```bash
# 1. Install regen-koi-mcp and authenticate once
# 2. In Claude Code, run: regen_koi_authenticate
#    (sign in with your @regen.network email at https://regen.gaiaai.xyz/activate)
# 3. Install this MCP — it will automatically read the token from ~/.koi-auth.json
```

Run the `auth_status` tool in this MCP to confirm your current auth state.

### Current state of auth enforcement

- **Read ops** (`search_claims`, `get_claim`, `list_attestations`, `get_attestation`) — require basic auth (nginx gate) but work anonymously at the app layer.
- **Write ops** (`create_claim`, `verify_claim`, `anchor_claim`, `create_attestation`, etc.) — require basic auth + Bearer once backend write-path auth is strict. Today some writes may succeed without Bearer; this is expected to tighten.

## Backend

All tools are thin HTTP wrappers around the `koi-processor` `/claims/*` and `/commitments/*` REST API. Backend source + contract tests: [gaiaaiagent/koi-processor](https://github.com/gaiaaiagent/koi-processor). OpenAPI: fetch `/claims/openapi.json` on the prod host.

## Related packages

- **[regen-koi-mcp](https://github.com/gaiaaiagent/regen-koi-mcp)** — KOI knowledge search, entity resolution, SPARQL
- **[regen-python-mcp](https://github.com/gaiaaiagent/regen-python-mcp)** — Regen Ledger read-only queries (balances, governance, ecocredits)
- **[personal-koi-mcp](https://github.com/gaiaaiagent/personal-koi-mcp)** — Darren's personal workflow stack (vault, tasks, sessions, Graphiti) — **not intended for team use**

## License

MIT
