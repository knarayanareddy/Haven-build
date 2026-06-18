import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Locale } from '@haven/contracts/src/haven';

import enGB from '../locales/en-GB.json';
import nlNL from '../locales/nl-NL.json';

export const messages: Record<Locale, Record<string, string>> = {
  'en-GB': enGB,
  'nl-NL': nlNL,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof typeof enGB, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale = 'nl-NL' }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    setLocale(initialLocale);
  }, [initialLocale]);

  function t(key: keyof typeof enGB, params?: Record<string, string | number>): string {
    const dict = messages[locale] ?? messages['nl-NL'];
    let template = dict[key] ?? messages['en-GB'][key] ?? key;
    
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    
    return template;
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const value = useContext(I18nContext);
  if (!value) {
    // Highly robust fallback specifically for standalone utility functions or un-wrapped test runners
    return {
      locale: 'nl-NL' as Locale,
      setLocale: () => {},
      t: (key: keyof typeof enGB, params?: Record<string, string | number>) => {
        let template = nlNL[key] ?? enGB[key] ?? key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
          }
        }
        return template;
      },
    };
  }
  return value;
}

export function translate(key: keyof typeof enGB, locale: Locale = 'nl-NL', params?: Record<string, string | number>): string {
  const dict = messages[locale] ?? messages['nl-NL'];
  let template = dict[key] ?? messages['en-GB'][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return template;
}
