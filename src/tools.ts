/**
 * Regen Claims MCP — tool definitions and handlers.
 *
 * Wraps the koi-processor /claims/* and /commitments/* REST APIs.
 * Tools are grouped by lifecycle stage:
 *   - Claims: create, search, get, verify, extract, link_evidence
 *   - On-chain: anchor_claim, reconcile_claim, get_proof_pack
 *   - Attestations: create/list/get/anchor/reconcile
 *   - Commitments (hackathon extension): draft_commitment_from_text, suggest_pool_routes
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import { getClient, authStatus } from './client.js';

export const TOOL_DEFINITIONS: Tool[] = [
  // ─── Meta / auth ──────────────────────────────────────────────────────────
  {
    name: 'auth_status',
    description:
      'Show the current auth state of this MCP: endpoint, basic-auth user, and whether a shared OAuth Bearer token is present and valid. Useful for diagnosing 401s. To obtain a Bearer token, run `regen_koi_authenticate` in the regen-koi-mcp plugin — the token is shared between the two MCPs via ~/.koi-auth.json. Run get_my_identity to see your entity URIs for use as claimant or reviewer.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_identity',
    description:
      'Return your authenticated email and entity URIs to use as claimant_uri when creating claims or reviewer_uri when attesting. Run this when you get a 422 "entity not found" error — it shows entity URIs registered to your account plus registry suggestions derived from your email.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },

  // ─── Claims: CRUD + verification ──────────────────────────────────────────
  {
    name: 'create_claim',
    description:
      'Create a new impact claim. Claims are structured assertions about environmental, social, or financial impact. The claimant must be an existing entity. Returns the created claim with its content-addressable RID.',
    inputSchema: {
      type: 'object',
      properties: {
        claimant_uri: {
          type: 'string',
          description: 'Entity URI of the claimant (must exist in entity_registry).',
        },
        statement: {
          type: 'string',
          description: 'Plain-language impact assertion (min 10 chars).',
        },
        claim_type: {
          type: 'string',
          enum: ['ecological', 'social', 'financial', 'governance'],
          description: 'Type of impact claim (default: ecological).',
        },
        about_uri: {
          type: 'string',
          description: 'Optional entity URI this claim is about (Location, Organization, Project, etc.).',
        },
        source_document: {
          type: 'string',
          description: 'Document RID or path the claim was extracted from (for provenance).',
        },
        ai_confidence: {
          type: 'number',
          description: 'AI extraction confidence 0.0-1.0 (omit if manually created).',
        },
        supersedes_rid: {
          type: 'string',
          description: 'Previous version claim_rid (creates supersedes_claim edge).',
        },
        metadata: {
          type: 'object',
          description: 'Extensible fields: quantity, unit, start_date, end_date, sdg_tags, methodology, theme_tags, etc.',
        },
      },
      required: ['claimant_uri', 'statement'],
    },
  },
  {
    name: 'search_claims',
    description:
      'Search impact claims with optional filters. Filter by verification level (self_reported, peer_reviewed, verified, ledger_anchored), claim type, claimant, or about entity.',
    inputSchema: {
      type: 'object',
      properties: {
        verification: { type: 'string', description: 'self_reported | peer_reviewed | verified | ledger_anchored' },
        claim_type: { type: 'string', description: 'ecological | social | financial | governance' },
        claimant_uri: { type: 'string', description: 'Filter by claimant entity URI' },
        about_uri: { type: 'string', description: 'Filter by the entity the claim is about' },
        limit: { type: 'number', description: 'Maximum results (default: 50, max: 200)' },
      },
    },
  },
  {
    name: 'get_claim',
    description: 'Get a specific claim by its RID, including linked evidence entities.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID (e.g. orn:koi-net.claim:...)' },
      },
      required: ['claim_rid'],
    },
  },
  {
    name: 'verify_claim',
    description:
      "Advance a claim's verification level. Valid transitions: self_reported→peer_reviewed→verified→ledger_anchored. Also: self_reported→withdrawn, peer_reviewed→withdrawn.",
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID to verify' },
        new_level: {
          type: 'string',
          enum: ['peer_reviewed', 'verified', 'ledger_anchored', 'withdrawn'],
          description: 'Target verification level',
        },
        actor: { type: 'string', description: 'Who is performing the verification' },
        reason: { type: 'string', description: 'Reason for the verification transition' },
      },
      required: ['claim_rid', 'new_level'],
    },
  },
  {
    name: 'extract_claims',
    description:
      'Extract structured impact claims from document text using AI. Returns candidate claims with confidence scores. Set auto_create=true to automatically persist extracted claims.',
    inputSchema: {
      type: 'object',
      properties: {
        document_text: { type: 'string', description: 'Document text to extract claims from (min 50 chars)' },
        source_document: { type: 'string', description: 'Document RID or path (required for provenance).' },
        auto_create: { type: 'boolean', description: 'If true, automatically create claims (default: false).' },
        confidence_threshold: { type: 'number', description: 'Minimum confidence (default: 0.7).' },
      },
      required: ['document_text', 'source_document'],
    },
  },
  {
    name: 'link_evidence',
    description:
      'Attach an evidence entity to a claim. The evidence must be an existing entity in the knowledge graph. Creates an evidences_claim relationship edge.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID to attach evidence to.' },
        evidence_uri: { type: 'string', description: 'Entity URI of the evidence (must exist in entity_registry).' },
        actor: { type: 'string', description: 'Who is linking the evidence.' },
      },
      required: ['claim_rid', 'evidence_uri'],
    },
  },

  // ─── On-chain: anchor + reconcile + proof pack ────────────────────────────
  {
    name: 'anchor_claim',
    description:
      'Anchor a verified claim on the Regen Ledger. The claim must be at "verified" state. Broadcasts MsgAnchor and transitions to ledger_anchored. May return 202 (pending) if broadcast succeeded but on-chain confirmation timed out — in that case, use reconcile_claim to finalize.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID to anchor on-chain.' },
      },
      required: ['claim_rid'],
    },
  },
  {
    name: 'reconcile_claim',
    description:
      'Check the on-chain status of a claim whose anchor broadcast timed out. Queries the transaction on-chain and transitions to ledger_anchored if confirmed, or returns pending/failed status.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID to reconcile.' },
      },
      required: ['claim_rid'],
    },
  },
  {
    name: 'get_proof_pack',
    description:
      'Download a verification bundle (proof pack) for a ledger-anchored claim. Returns content hash, ledger IRI, tx hash, and linked evidence. Only works for claims at verification level "ledger_anchored".',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID (must be ledger_anchored).' },
      },
      required: ['claim_rid'],
    },
  },

  // ─── Attestations: peer review + on-chain anchoring ───────────────────────
  {
    name: 'create_attestation',
    description:
      'Create a peer-review attestation for a claim. Attestations are reviews by other entities vouching for or against the claim. UPSERT: re-attesting from the same reviewer updates the existing attestation.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim being attested.' },
        reviewer_uri: { type: 'string', description: 'Entity URI of the reviewer.' },
        verdict: {
          type: 'string',
          enum: ['approved', 'rejected', 'needs_info'],
          description: 'Reviewer verdict.',
        },
        rationale: { type: 'string', description: 'Why the reviewer is approving/rejecting.' },
        evidence_uris: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional supporting evidence entity URIs.',
        },
      },
      required: ['claim_rid', 'reviewer_uri', 'verdict'],
    },
  },
  {
    name: 'list_attestations',
    description: 'List all attestations for a claim.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The claim RID.' },
      },
      required: ['claim_rid'],
    },
  },
  {
    name: 'get_attestation',
    description: 'Get a single attestation by its RID.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The parent claim RID.' },
        attestation_rid: { type: 'string', description: 'The attestation RID.' },
      },
      required: ['claim_rid', 'attestation_rid'],
    },
  },
  {
    name: 'anchor_attestation',
    description:
      'Anchor an attestation on the Regen Ledger. Like anchor_claim, this broadcasts MsgAnchor and may return 202 (pending); use reconcile_attestation to finalize.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The parent claim RID.' },
        attestation_rid: { type: 'string', description: 'The attestation RID to anchor.' },
      },
      required: ['claim_rid', 'attestation_rid'],
    },
  },
  {
    name: 'reconcile_attestation',
    description:
      'Check the on-chain status of an attestation whose anchor broadcast timed out.',
    inputSchema: {
      type: 'object',
      properties: {
        claim_rid: { type: 'string', description: 'The parent claim RID.' },
        attestation_rid: { type: 'string', description: 'The attestation RID to reconcile.' },
      },
      required: ['claim_rid', 'attestation_rid'],
    },
  },

  // ─── Commitments (hackathon extension, Mar 2026) ──────────────────────────
  {
    name: 'draft_commitment_from_text',
    description:
      'Parse natural-language commitment text into a structured draft via LLM extraction. Returns a CommitmentCreateRequest-shaped draft for human review — nothing is persisted. Requires OPENAI_API_KEY in env.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Natural-language commitment description (e.g. "I can offer 20 hours of permaculture consulting in Cascadia through June 2026").',
        },
        pledger_uri: {
          type: 'string',
          description: 'Optional: entity URI of the pledger if known.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'suggest_pool_routes',
    description:
      'Get routing suggestions for a commitment draft or existing commitment. Returns scored pool matches based on offer type, bioregion, tags, and existing pool demand.',
    inputSchema: {
      type: 'object',
      properties: {
        draft: {
          type: 'object',
          description: 'A commitment draft (as returned by draft_commitment_from_text). Provide this or commitment_rid.',
        },
        commitment_rid: {
          type: 'string',
          description: 'RID of an existing commitment to fetch and score. Provide this or draft.',
        },
      },
    },
  },
];

type HandlerArgs = Record<string, unknown>;

export async function dispatchTool(name: string, args: HandlerArgs) {
  const client = getClient();

  switch (name) {
    case 'auth_status':
      return textResult(authStatus());

    case 'get_my_identity': {
      const { data } = await client.get('/claims/identity');
      return textResult(JSON.stringify(data, null, 2));
    }

    // ─── Claims CRUD ─────────────────────────────────────────────────────────
    case 'create_claim': {
      const body: Record<string, unknown> = {
        claimant_uri: args.claimant_uri,
        statement: args.statement,
      };
      if (args.claim_type) body.claim_type = args.claim_type;
      if (args.about_uri) body.about_uri = args.about_uri;
      if (args.source_document) body.source_document = args.source_document;
      if (args.ai_confidence !== undefined) body.ai_confidence = args.ai_confidence;
      if (args.supersedes_rid) body.supersedes_rid = args.supersedes_rid;
      if (args.metadata) body.metadata = args.metadata;
      const { data } = await client.post('/claims/', body);
      return jsonResult(data);
    }

    case 'search_claims': {
      const params = new URLSearchParams();
      if (args.verification) params.set('verification', args.verification as string);
      if (args.claim_type) params.set('claim_type', args.claim_type as string);
      if (args.claimant_uri) params.set('claimant_uri', args.claimant_uri as string);
      if (args.about_uri) params.set('about_uri', args.about_uri as string);
      if (args.limit) params.set('limit', String(args.limit));
      const qs = params.toString();
      const { data } = await client.get(`/claims/${qs ? '?' + qs : ''}`);
      return jsonResult(data);
    }

    case 'get_claim': {
      const rid = args.claim_rid as string;
      const { data } = await client.get(`/claims/${encodeURIComponent(rid)}`);
      return jsonResult(data);
    }

    case 'verify_claim': {
      const rid = args.claim_rid as string;
      const body: Record<string, unknown> = { new_level: args.new_level };
      if (args.actor) body.actor = args.actor;
      if (args.reason) body.reason = args.reason;
      const { data } = await client.patch(`/claims/${encodeURIComponent(rid)}/verify`, body);
      return jsonResult(data);
    }

    case 'extract_claims': {
      const body: Record<string, unknown> = {
        document_text: args.document_text,
        source_document: args.source_document,
      };
      if (args.auto_create !== undefined) body.auto_create = args.auto_create;
      if (args.confidence_threshold !== undefined) body.confidence_threshold = args.confidence_threshold;
      const { data } = await client.post('/claims/extract', body);
      return jsonResult(data);
    }

    case 'link_evidence': {
      const rid = args.claim_rid as string;
      const body: Record<string, unknown> = { evidence_uri: args.evidence_uri };
      if (args.actor) body.actor = args.actor;
      const { data } = await client.post(`/claims/${encodeURIComponent(rid)}/evidence`, body);
      return jsonResult(data);
    }

    // ─── On-chain ─────────────────────────────────────────────────────────────
    case 'anchor_claim': {
      const rid = args.claim_rid as string;
      const resp = await client.post(`/claims/${encodeURIComponent(rid)}/anchor`, undefined, {
        validateStatus: (s: number) => s === 200 || s === 202,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = resp.data as any;
      if (resp.status === 202 || data?.status === 'pending') {
        const msg = data?.message || 'Anchor broadcast pending — call reconcile_claim to finalize.';
        return textResult(`⏳ Anchor pending:\n${msg}\n\n${JSON.stringify(data, null, 2)}`);
      }
      return jsonResult(data);
    }

    case 'reconcile_claim': {
      const rid = args.claim_rid as string;
      const { data } = await client.post(`/claims/${encodeURIComponent(rid)}/reconcile`);
      return jsonResult(data);
    }

    case 'get_proof_pack': {
      const rid = args.claim_rid as string;
      const { data } = await client.get(`/claims/${encodeURIComponent(rid)}/proof-pack`);
      return jsonResult(data);
    }

    // ─── Attestations ────────────────────────────────────────────────────────
    case 'create_attestation': {
      const rid = args.claim_rid as string;
      const body: Record<string, unknown> = {
        reviewer_uri: args.reviewer_uri,
        verdict: args.verdict,
      };
      if (args.rationale) body.rationale = args.rationale;
      if (args.evidence_uris) body.evidence_uris = args.evidence_uris;
      const { data } = await client.post(`/claims/${encodeURIComponent(rid)}/attestations`, body);
      return jsonResult(data);
    }

    case 'list_attestations': {
      const rid = args.claim_rid as string;
      const { data } = await client.get(`/claims/${encodeURIComponent(rid)}/attestations`);
      return jsonResult(data);
    }

    case 'get_attestation': {
      const rid = args.claim_rid as string;
      const attRid = args.attestation_rid as string;
      const { data } = await client.get(
        `/claims/${encodeURIComponent(rid)}/attestations/${encodeURIComponent(attRid)}`,
      );
      return jsonResult(data);
    }

    case 'anchor_attestation': {
      const rid = args.claim_rid as string;
      const attRid = args.attestation_rid as string;
      const resp = await client.post(
        `/claims/${encodeURIComponent(rid)}/attestations/${encodeURIComponent(attRid)}/anchor`,
        undefined,
        { validateStatus: (s: number) => s === 200 || s === 202 },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = resp.data as any;
      if (resp.status === 202 || data?.status === 'pending') {
        const msg = data?.message || 'Attestation anchor broadcast pending — call reconcile_attestation to finalize.';
        return textResult(`⏳ Anchor pending:\n${msg}\n\n${JSON.stringify(data, null, 2)}`);
      }
      return jsonResult(data);
    }

    case 'reconcile_attestation': {
      const rid = args.claim_rid as string;
      const attRid = args.attestation_rid as string;
      const { data } = await client.post(
        `/claims/${encodeURIComponent(rid)}/attestations/${encodeURIComponent(attRid)}/reconcile`,
      );
      return jsonResult(data);
    }

    // ─── Commitments (hackathon extension) ───────────────────────────────────
    case 'draft_commitment_from_text': {
      return await draftCommitmentFromText(args);
    }

    case 'suggest_pool_routes': {
      return await suggestPoolRoutes(args);
    }

    default:
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

async function draftCommitmentFromText(args: HandlerArgs) {
  const text = args.text as string;
  const pledgerUri = (args.pledger_uri as string) || '';
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return {
      content: [{ type: 'text' as const, text: 'OPENAI_API_KEY not set — cannot parse commitment text.' }],
      isError: true,
    };
  }

  const systemPrompt = `You are a commitment parser for a bioregional knowledge commons. Given natural language text describing a commitment (an offer of labor, goods, service, knowledge, or stewardship), extract a structured JSON object.

Output ONLY valid JSON matching this shape:
{
  "pledger_uri": "entity URI if identifiable, else empty string",
  "title": "short title (under 80 chars)",
  "description": "the full original text",
  "offer_type": "labor|goods|service|knowledge|stewardship",
  "quantity": null or number,
  "unit": null or string,
  "validity_start": null or ISO date string,
  "validity_end": null or ISO date string,
  "metadata": {
    "wants": ["list of things the pledger wants in return, if expressed"],
    "limits": ["list of constraints or limits expressed"],
    "bioregion_uri": "entity URI or name of bioregion if identifiable, else empty string",
    "estimated_value_usd": null or number,
    "routing_tags": ["inferred topic/domain tags for matching"]
  }
}

Rules:
- offer_type must be exactly one of: labor, goods, service, knowledge, stewardship
- If dates are relative (e.g. "through June"), interpret relative to today
- routing_tags should include 2-5 relevant domain keywords for pool matching
- Do not invent information not present in the text`;

  const userPrompt = pledgerUri
    ? `Pledger URI: ${pledgerUri}\n\nCommitment text: ${text}`
    : `Commitment text: ${text}`;

  const openaiResp = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    },
    {
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawContent = (openaiResp.data as any)?.choices?.[0]?.message?.content;
  if (!rawContent) {
    return {
      content: [{ type: 'text' as const, text: 'LLM returned empty response — could not parse commitment.' }],
      isError: true,
    };
  }

  const draft = JSON.parse(rawContent);
  return textResult(
    `Draft commitment (NOT persisted — review before creating):\n\n${JSON.stringify(draft, null, 2)}`,
  );
}

async function suggestPoolRoutes(args: HandlerArgs) {
  const client = getClient();
  const draft = args.draft as Record<string, unknown> | undefined;
  const commitmentRid = args.commitment_rid as string | undefined;

  if (!draft && !commitmentRid) {
    return {
      content: [{ type: 'text' as const, text: 'Provide either "draft" (commitment object) or "commitment_rid".' }],
      isError: true,
    };
  }

  let routingPayload: Record<string, unknown>;
  if (commitmentRid) {
    const resp = await client.get(`/commitments/${encodeURIComponent(commitmentRid)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const commitment = resp.data as any;
    routingPayload = {
      pledger_uri: commitment.pledger_uri,
      title: commitment.title,
      offer_type: commitment.offer_type,
      quantity: commitment.quantity,
      unit: commitment.unit,
      validity_start: commitment.validity_start,
      validity_end: commitment.validity_end,
      metadata: commitment.metadata || {},
    };
  } else {
    routingPayload = draft!;
  }

  const { data } = await client.post('/commitments/routing-suggestions', routingPayload);
  return jsonResult(data);
}
