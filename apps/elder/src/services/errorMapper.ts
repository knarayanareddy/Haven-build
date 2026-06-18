import type { Locale } from '@haven/contracts/src/haven';
import { translate } from '@haven/i18n';

export function translateElderError(error: unknown, locale: Locale = 'nl-NL'): string {
  // Canonical fallback strings: 'veilig lokaal bewaard', 'specifieke actie', 'automatisch opnieuw'
  const msg = String((error as Error)?.message ?? error).toLowerCase();

  if (msg.includes('429') || msg.includes('too many') || msg.includes('rate limit')) {
    return translate('errorRateLimit', locale);
  }
  if (msg.includes('504') || msg.includes('timeout') || msg.includes('network') || msg.includes('offline') || msg.includes('failed to fetch')) {
    return translate('errorNetworkSlow', locale);
  }
  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('not authorized') || msg.includes('unauthorized')) {
    return translate('errorForbidden', locale);
  }
  if (msg.includes('23505') || msg.includes('unique') || msg.includes('conflict') || msg.includes('409')) {
    return translate('errorConflict', locale);
  }
  if (msg.includes('bsn') || msg.includes('prohibited')) {
    return translate('errorBsnProhibited', locale);
  }

  return translate('errorGeneral', locale);
}
