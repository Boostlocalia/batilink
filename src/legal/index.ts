import type { Language } from '@/i18n';

import { legalFr } from './fr';
import { legalNl } from './nl';
import type { LegalTexts } from './types';

export * from './types';

export function legalTexts(language: Language): LegalTexts {
  return language === 'nl' ? legalNl : legalFr;
}
