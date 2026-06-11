export const forbiddenDocumentTerms = ['BSN', 'burgerservicenummer', 'DigiD'];

export function documentUploadWarning(locale: 'en-GB' | 'nl-NL') {
  return locale === 'nl-NL'
    ? 'Upload geen documenten met uw BSN-nummer. Maak het BSN onleesbaar voordat u het document uploadt.'
    : 'Do not upload documents showing your BSN. Redact the BSN before uploading.';
}

export function containsForbiddenDocumentTerm(text: string) {
  const lower = text.toLowerCase();
  return forbiddenDocumentTerms.some((term) => lower.includes(term.toLowerCase())) || /\b\d{9}\b/.test(text);
}

export function piiSafeLog(input: Record<string, unknown>) {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/email|phone|transcript|name|address|token/i.test(key)) clone[key] = '[redacted]';
    else clone[key] = value;
  }
  return clone;
}
