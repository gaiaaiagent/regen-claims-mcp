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

- **Read ops** (`search_claims`, `get_claim`, `list_attestations`) work without auth against production.
- **Write ops** (`create_claim`, `verify_claim`, `anchor_claim`, `create_attestation`, etc.) require `KOI_API_KEY` for write access. Talk to Darren to get a team key.

## Backend

All tools are thin HTTP wrappers around the `koi-processor` `/claims/*` and `/commitments/*` REST API. Backend source + contract tests: [gaiaaiagent/koi-processor](https://github.com/gaiaaiagent/koi-processor). OpenAPI: fetch `/claims/openapi.json` on the prod host.

## Related packages

- **[regen-koi-mcp](https://github.com/gaiaaiagent/regen-koi-mcp)** — KOI knowledge search, entity resolution, SPARQL
- **[regen-python-mcp](https://github.com/gaiaaiagent/regen-python-mcp)** — Regen Ledger read-only queries (balances, governance, ecocredits)
- **[personal-koi-mcp](https://github.com/gaiaaiagent/personal-koi-mcp)** — Darren's personal workflow stack (vault, tasks, sessions, Graphiti) — **not intended for team use**

## License

MIT
