import { describe, expect, it } from 'vitest';

import { answeredCount } from './answers';

describe('answeredCount', () => {
  it('counts prices, PDFs and messages, not silence or a refusal', () => {
    const quotes = [
      { id: 'a', status: 'submitted', offer_file_path: null },
      { id: 'b', status: 'invited', offer_file_path: 'b/x.pdf' },
      { id: 'c', status: 'invited', offer_file_path: null },
      { id: 'd', status: 'invited', offer_file_path: null },
      { id: 'e', status: 'declined', offer_file_path: null },
    ];
    expect(answeredCount(quotes, new Set(['c']))).toBe(3);
  });
});
