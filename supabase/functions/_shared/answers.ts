export type QuoteState = { id: string; status: string; offer_file_path: string | null };

/** Suppliers who answered a request: prices, a PDF, or at least a message (a refusal is not an answer). */
export function answeredCount(quotes: QuoteState[], wrote: Set<string>): number {
  return quotes.filter((q) => q.status !== 'declined' && (q.status !== 'invited' || q.offer_file_path || wrote.has(q.id))).length;
}
