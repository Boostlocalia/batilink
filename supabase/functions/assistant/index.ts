// The in-app assistant: answers questions about how the platform works.
// Signed-in contractors and architects call it with their session; suppliers
// with the token of their personal link.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';

import { assistantSystemPrompt, audienceNote, type Audience } from '../_shared/assistant-prompt.ts';
import { adminClient, callerCompanyId, corsHeaders, json } from '../_shared/supabase.ts';
import { hashToken } from '../_shared/tokens.ts';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 12;
const MAX_CHARS = 2000;

type Turn = { role: 'user' | 'assistant'; content: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = adminClient();
  const body = (await req.json()) as { messages?: Turn[]; token?: string; language?: string };

  // Who is asking: a signed-in company, or a supplier holding a valid link.
  let audience: Audience | null = null;
  const companyId = await callerCompanyId(req, admin);
  if (companyId) {
    const { data } = await admin.from('companies').select('kind').eq('id', companyId).single();
    audience = data?.kind === 'architect' ? 'architect' : 'contractor';
  } else if (typeof body.token === 'string' && body.token.length >= 20) {
    const { data } = await admin.from('quotes').select('token_expires_at').eq('token_hash', await hashToken(body.token)).maybeSingle();
    if (data && new Date(data.token_expires_at) > new Date()) audience = 'supplier';
  }
  if (!audience) return json({ error: 'unauthorized' }, 401);

  // Keep the last turns, starting with the person, alternating, each one short.
  const turns = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return json({ error: 'invalid_messages' }, 400);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'assistant_unavailable' }, 503);

  const language = body.language === 'nl' ? 'Dutch' : 'French';
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        // Same text on every call, so it is cached.
        { type: 'text', text: assistantSystemPrompt(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${audienceNote(audience)} The app is set to ${language}.` },
      ],
      messages: turns,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (response.stop_reason === 'refusal') return json({ error: 'assistant_unavailable' }, 503);
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim();
    return json({ reply: text });
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error('claude', error.status, error.message);
    else console.error('claude', error);
    return json({ error: 'assistant_unavailable' }, 503);
  }
});
