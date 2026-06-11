import type { Locale } from '@haven/contracts/src/haven';

export const copy: Record<Locale, Record<string, string>> = {
  'en-GB': {
    havenDigitalDisclosure: 'Hello, I am HAVEN — your digital helper.',
    medicationTaken: 'Well done. I recorded it.',
    scamCalmPause: 'Let us slow down together. You do not need to do anything right now.',
    locationPrivacy: 'HAVEN shows an approximate area, never a live route.',
    buurtPrivacy: 'Your name is shared only if both people say yes.',
  },
  'nl-NL': {
    havenDigitalDisclosure: 'Hallo, ik ben HAVEN — uw digitale hulp.',
    medicationTaken: 'Goed gedaan. Ik heb het genoteerd.',
    scamCalmPause: 'We vertragen samen. U hoeft nu niets te doen.',
    locationPrivacy: 'HAVEN toont een globale omgeving, nooit een live route.',
    buurtPrivacy: 'Uw naam wordt pas gedeeld als beide mensen ja zeggen.',
  },
};

export function t(locale: Locale, key: keyof typeof copy['en-GB']) {
  return copy[locale][key] ?? copy['en-GB'][key];
}
