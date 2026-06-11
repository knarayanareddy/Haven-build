export const crisisPhrasesNl = ['ik ben gevallen', 'ik ben bang', 'ik voel me niet goed', 'bel een ambulance', 'ik wil er niet meer zijn'];
export const crisisPhrasesEn = ['i have fallen', 'i am scared', 'i do not feel well', 'call an ambulance', 'i do not want to be here anymore'];

export function detectCrisisPhrase(transcript: string) {
  const lower = transcript.toLowerCase();
  const phrase = [...crisisPhrasesNl, ...crisisPhrasesEn].find((candidate) => lower.includes(candidate));
  return { distressDetected: Boolean(phrase), phrase: phrase ?? null };
}

export function crisisResponse(locale: 'en-GB' | 'nl-NL') {
  return locale === 'nl-NL'
    ? 'Ik ben bij u. Ik waarschuw uw familie en toon de hulpknop.'
    : 'I am with you. I will notify your family and show the help button.';
}
