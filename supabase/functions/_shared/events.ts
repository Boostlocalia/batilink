import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Event = {
  kind:
    | 'request_sent'
    | 'request_completed'
    | 'quote_submitted'
    | 'quote_declined'
    | 'quote_awarded'
    | 'supplier_reminded'
    | 'requests_closed'
    | 'message_relayed'
    | 'message_ignored'
    | 'inbound_rejected'
    | 'agreement_checked'
    | 'order_confirmed'
    | 'order_ready'
    | 'order_declined'
    | 'order_cancelled'
    | 'deposit_proof_sent'
    | 'deposit_received'
    | 'deposit_rejected'
    | 'order_delivered'
    | 'document_uploaded'
    | 'invoice_checked'
    | 'payment_reported'
    | 'payment_succeeded'
    | 'payment_failed'
    | 'subscription_changed'
    | 'founder_joined'
    | 'founder_upgraded'
    | 'founder_ended'
    | 'commission_billed'
    | 'supplier_requested'
    | 'supplier_unsubscribed'
    | 'contact_requested'
    | 'contact_accepted'
    | 'network_deal'
    | 'news_published'
    | 'quota_alert'
    | 'request_relaunched'
    | 'offer_via_support'
    | 'correction_requested'
    | 'correction_received'
    | 'account_deleted';
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
