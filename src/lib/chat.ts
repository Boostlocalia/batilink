import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Direct messages between network companies. Every read and write goes through
// the `chat` edge function, which only shows a company its own conversations.

export type DealKind = 'subcontract' | 'shared_site' | 'equipment' | 'other';
export const DEAL_KINDS: DealKind[] = ['subcontract', 'shared_site', 'equipment', 'other'];

export type ConversationView = {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  /** The caller started it (sent the contact request). */
  mine: boolean;
  blockedByMe: boolean;
  opportunityId: string | null;
  lastMessageAt: string;
  unread: boolean;
  other: { id: string; name: string; city: string | null; kind: string; logoUrl: string | null; verified: boolean } | null;
  deal: { mine: boolean; theirs: boolean; confirmedAt: string | null; kind: DealKind | null; amount: number | null; note: string | null };
};

export type ChatMessage = { id: string; mine: boolean; body: string; createdAt: string };

export async function chat<T>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('chat', { body });
  if (!error) return { data: data as T };
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => ({}))) as { error?: string };
    return { error: payload.error ?? 'error' };
  }
  return { error: 'error' };
}
