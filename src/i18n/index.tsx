import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { fr, type Dictionary } from './fr';
import { nl } from './nl';

export type Language = 'fr' | 'nl';

const dictionaries: Record<Language, Dictionary> = { fr, nl };
const STORAGE_KEY = 'batilink.language';

function deviceLanguage(): Language {
  return getLocales().some((l) => l.languageCode === 'nl') ? 'nl' : 'fr';
}

type LanguageContextValue = {
  language: Language;
  t: Dictionary;
  setLanguage: (language: Language) => void;
  /** Belgian locale for numbers and dates. */
  locale: 'fr-BE' | 'nl-BE';
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'fr' || stored === 'nl') setLanguageState(stored);
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  return (
    <LanguageContext.Provider
      value={{ language, t: dictionaries[language], setLanguage, locale: language === 'fr' ? 'fr-BE' : 'nl-BE' }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useI18n must be used inside LanguageProvider');
  return value;
}
