import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Event = {
  kind:
    | 'request_sent'
    | 'quote_submitted'
    | 'quote_declined'
    | 'quote_awarded'
    | 'supplier_reminded'
    | 'requests_closed'
    | 'message_relayed'
    | 'message_ignored'
    | 'inbound_rejected'
    | 'agreement_checked';
  company_id?: string | null;
  request_id?: string | null;
  quote_id?: string | null;
  data?: Record<string, unknown>;
};

/** Appends to the event log. Never blocks or fails the user's action. */
export async function logEvent(admin: SupabaseClient, event: Event): Promise<void> {
  const { error } = await admin.from('events').insert(event);
  if (error) console.error('event log', error.message);
}
