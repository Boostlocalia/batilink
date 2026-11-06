import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * A cancelled order gives the choice back to the contractor: the request is open again and
 * every answered offer can be chosen. A supplier who declined the order is not offered again.
 */
export async function reopenRequest(admin: SupabaseClient, order: { request_id: string; quote_id: string }, supplierDeclined: boolean) {
  await admin.from('price_requests').update({ status: 'sent' }).eq('id', order.request_id).eq('status', 'awarded');
  await admin
    .from('quotes')
    .update({ status: supplierDeclined ? 'declined' : 'submitted' })
    .eq('id', order.quote_id)
    .eq('status', 'awarded');
  // The other offers were set aside by the award: answered ones come back, the others wait again.
  await admin.from('quotes').update({ status: 'submitted' }).eq('request_id', order.request_id).eq('status', 'not_selected').not('submitted_at', 'is', null);
  await admin.from('quotes').update({ status: 'invited' }).eq('request_id', order.request_id).eq('status', 'not_selected').is('submitted_at', null);
}
