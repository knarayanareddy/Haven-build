# HAVEN Edge Function Trust Boundary Matrix

This matrix classifies each Edge Function by its intended trust boundary after the 2026-06 hardening passes.

## Authenticated user-facing (`verify_jwt = true`)

- `fn-audit-query`
- `fn-bereavement-support`
- `fn-browser-shield`
- `fn-buurt-discover`
- `fn-buurt-match`
- `fn-buurt-optout`
- `fn-call-reputation`
- `fn-care-plan`
- `fn-care-visit-log`
- `fn-carer-medications`
- `fn-companion-memory`
- `fn-consent-update`
- `fn-data-export`
- `fn-device-session`
- `fn-document-analyse`
- `fn-driving-event`
- `fn-family-message-send`
- `fn-feature-flags`
- `fn-grandchild-message-send`
- `fn-health-log`
- `fn-incident-report`
- `fn-life-story-process`
- `fn-location-ingest`
- `fn-medication-ocr`
- `fn-notification-preferences`
- `fn-push-token-register`
- `fn-right-to-erasure`
- `fn-scam-pipeline`
- `fn-screen-data`
- `fn-skill-exchange`
- `fn-storage-signed-url`
- `fn-telehealth-transport`
- `fn-voice-pipeline`
- `fn-wearable-event`
- `fn-legacy-vault`

## Hybrid public/authenticated

These functions contain at least one public or vendor-facing path and therefore cannot use blanket JWT enforcement at the function gateway.

- `fn-emergency-profile`
  - public: emergency-token lookup
  - authenticated: emergency token creation

## Internal / admin / vendor (`verify_jwt = false`)

These functions are intentionally outside the standard user-JWT gateway path.

### Admin bearer required

These routes now require a real admin bearer token and use RLS-backed admin policies where possible.

- `fn-breach-incident`
- `fn-compliance-register`
- `fn-log-drain-config`
- `fn-observability-alert`
- `fn-release-check`
- `fn-slo-measure`

### Vendor secret or internal header

These routes accept either the internal header guard (`x-haven-internal-key`) or a vendor-specific secret header.

- `fn-buurt-events-ingest`
  - vendor secret: `HAVEN_EVENT_INGEST_SECRET`
- `fn-community-events-ingest`
  - vendor secret: `HAVEN_EVENT_INGEST_SECRET`
- `fn-medmij-fhir-import`
  - vendor secret: `MEDMIJ_IMPORT_SECRET`
- `fn-transaction-intercept`
  - vendor secret: `PSD2_WEBHOOK_SECRET`

### Internal header only

These routes now fail closed unless they receive the internal header guard.

- `fn-care-system-sync`
- `fn-daily-reminder-scheduler`
- `fn-health-check`
- `fn-medication-catalog-sync`
- `fn-medication-escalation`
- `fn-medication-refill`
- `fn-notification-dispatch`
- `fn-onboarding`
- `fn-vital-threshold-check`
- `fn-weekly-digest`
