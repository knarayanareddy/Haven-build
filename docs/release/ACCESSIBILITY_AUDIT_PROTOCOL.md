# HAVEN Accessibility Audit Protocol

## Automated checks

- Schema constitution: all screens depth <= 2, emergency access, fallback voice copy.
- Static visual suite smoke test.
- RLS and storage isolation checks.

## Manual device checks before release

1. iOS VoiceOver can reach every primary action.
2. Android TalkBack can reach every primary action.
3. Dynamic Type at 200% does not clip primary actions.
4. High-contrast mode preserves meaning without colour-only cues.
5. Medication confirmation target is at least 72x72 dp.
6. Emergency/help action is available from all elder screens.
7. Voice prompt and screen reader do not overlap confusingly.
8. Dutch formal `u/uw` is used for elder-facing Dutch copy.

## Release criterion

No P0/P1 accessibility issues may remain for elder-facing medication, emergency, voice, family-message or scam-alert flows.
