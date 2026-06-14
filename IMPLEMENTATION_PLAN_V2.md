# HAVEN v2.0 — Stakeholder-Complete Implementation Plan

**Date:** 2026-06-14
**Status:** Prioritized Engineering Plan — Ready for Execution
**Total Effort:** 202 hours | 4 phases | 8 weeks

---

## 1. EXECUTIVE SUMMARY

The backend is **production-hardened**: 75 Edge Functions, 13 migrations, forced RLS, atomic idempotency, GDPR-complete erasure, full security hardening (55 findings, 46 fixed). The gap is entirely in **UX surface area and platform integration clients**. This plan closes that gap in 8 weeks.

---

## 2. PHASE 1: THE GRANDMA TEST (2 Weeks, 29 hours)

**Goal:** An 80-year-old Dutch grandmother uses HAVEN daily without family explaining it.

### 1.1 Floating Voice Button (4 hours)
Persistent 72x72px mic button on 5 primary screens. Press → record 5s → `fn-voice-pipeline` → TTS plays.
- New: `FloatingVoiceButton.tsx`. Modify: `ScreenRenderer.tsx`, `screenSchema.ts` (add `showFloatingVoice`). Zero backend.

### 1.2 Simplified Home Screen — 5 Cards Max (6 hours)
Home: Mijn Pillen, Familie, Schild, Vandaag, Meer. "Meer" expands to BUURT/KOMPAS/STEM/WACHT/SETTINGS.
- Modify: `ElderScreen.tsx`, `screenSchema.ts`. Zero backend.

### 1.3 "What Do I Do?" Help Button (3 hours)
"?" button top-right. Tap → HAVEN speaks screen purpose: "U kunt hier uw pillen zien. Tik op Ingenomen."
- New: `HelpOverlay.tsx`. Modify: `screenSchema.ts` (add `helpTextNl`, `helpTextEn`). Zero backend.

### 1.4 Photo Check-In (5 hours)
Family clicks "Vraag een foto" → push to elder → big camera button → stored in `profile-photos` (24h TTL) → pushed to family.
- New: `fn-photo-checkin` Edge Function. Migration: add `photo_checkin` to message_type enum. 2 UI components.

### 1.5 WhatsApp Fallback for Critical Alerts (8 hours)
Push fails for P0/P1 alerts → send WhatsApp via Meta Business API. Respects quiet hours.
- New: `_shared/whatsapp.ts`. Modify: `core.ts` dispatchNotification. Migration: `whatsapp_enabled`, `whatsapp_phone`.

### 1.6 Carer Portal Responsive CSS (3 hours)
Viewport meta tag + `@media (max-width: 480px)` responsive grid. Min 56px buttons, 16px fonts. CSS-only.

**Phase 1 Total: 1 new Edge Function, 1 new shared module, 4 new components, 1 migration.**

---

## 3. PHASE 2: FAMILY REASSURANCE (2 Weeks, 29 hours)

**Goal:** Daughter in Rotterdam opens dashboard — knows in 5 seconds her mother is safe.

### 2.1 "Call Grandma" Button (12 hours)
"Bel op" → creates video call → elder sees INCOMING_CALL → Supabase Realtime signaling → falls back to phone call.
- New: `CallButton.tsx`. Modify: `dashboard/page.tsx`. Polish elder incoming-call UI.

### 2.2 Emergency Precise Location (6 hours)
When `fall_events.status = 'no_response'` → one-time precise location link (30 min TTL). Audit-logged.
- Modify: `fn-fall-escalation/index.ts`. No new endpoints.

### 2.3 Pharmacy Refill Email (5 hours)
Stock < 7 days → auto-email pharmacy. Family notified.
- Modify: `fn-medication-refill/index.ts`. Migration: `pharmacy_email`, `pharmacy_name` columns.

### 2.4 Weekly Digest Email (6 hours)
Sunday 10:00 email: "🟢 Alles goed. 21/21 medicijnen. 0 verdachte oproepen."
- Modify: `fn-weekly-digest/index.ts`. Migration: `email_digest_enabled` column.

**Phase 2 Total: 3 FNs modified, 2 migrations.**

---

## 4. PHASE 3: CARE WORKER ENABLEMENT (2 Weeks, 42 hours)

**Goal:** Nurse Eva visits 8 elders, logs notes from phone. Nurse Petra picks up seamlessly.

### 3.1 Carer Mobile App — Expo (20 hours)
New `apps/carer/`: PIN/biometric login, today's schedule, one-tap Start/Complete visit, offline queue, push.
- ~15 new files. All backend endpoints already exist. Zero backend changes.

### 3.2 Shift Handover Summary (8 hours)
New `fn-shift-summary`: visits completed, medications, incidents, outstanding tasks, recommendation.
- 1 new Edge Function, 1 new screen in carer app.

### 3.3 Photo Attachments to Handover Notes (6 hours)
Carer attaches wound/medication photos. New `handover-photos` bucket (30-day TTL). BSN auto-rejected.
- Modify: `fn-carer-handover-note/index.ts`. Migration: `photo_paths` column.

### 3.4 Medication Interaction Check at Care Point (8 hours)
Carer logs MAR-light → auto interaction check against all active medications → warning if critical.
- Modify: `fn-carer-handover-note/index.ts` (cross-call `fn-medication-interactions-check`).

**Phase 3 Total: 1 new Edge Function, 1 new Expo app (~15 files), 2 migrations.**

---

## 5. PHASE 4: PLATFORM INTEGRATIONS (2 Weeks, 102 hours)

**Goal:** HAVEN screens scam calls, monitors WhatsApp, detects falls via Apple Watch, tracks bank transactions.

### 4.1 WhatsApp Business Integration (20 hours)
Two-way: Elder forwards suspicious message → `fn-scam-pipeline` → Dutch reply. Critical alerts → family WhatsApp.
- New: `fn-whatsapp-webhook` (1 FN), `_shared/whatsapp.ts`. Meta Business account.

### 4.2 Apple Watch Companion App (30 hours)
WatchOS: fall detection (CMFallDetectionManager), heart rate, emergency long-press, medication Taptic Engine, complication.
- ~12 WatchOS files. Zero backend changes.

### 4.3 Android Call Screening Service (16 hours)
`CallScreeningService`: intercepts incoming calls → `fn-call-reputation`. Score ≥70: "Niet opnemen."
- 1 Android service. Backend already exists.

### 4.4 Android SMS Receiver (10 hours)
`BroadcastReceiver`: intercepts SMS → `fn-scam-pipeline` → notification if suspicious. Does NOT block.
- 1 Android BroadcastReceiver. Backend already exists.

### 4.5 Tink/PSD2 Bank Connection (16 hours)
Family-assisted: "Koppel bankrekening" → Tink OAuth → elder authorizes → webhook → `fn-transaction-intercept`.
- New: `fn-bank-connect` (1 FN). Tink account. Backend already exists.

### 4.6 Calendar Sync (10 hours)
Read/write elder calendar ↔ HAVEN appointments. Family Agenda tab. `expo-calendar`, BackgroundFetch.
- New: `calendarSync.ts` service, family Agenda view.

**Phase 4 Total: 2 new Edge Functions, ~18 new files, 0 migrations.**

---

## 6. DEPLOYMENT STRATEGY

| Week | Phase | Feature Flags |
|------|-------|---------------|
| 1-2 | Phase 1 | UX: always on. WhatsApp: flag-gated |
| 3-4 | Phase 2 | All behind feature flags |
| 5-6 | Phase 3 | Shift summary: flag-gated |
| 7-8 | Phase 4 | Each integration behind its own flag |

### Migration (1 SQL file)
```sql
ALTER TABLE notification_preferences ADD COLUMN whatsapp_enabled boolean DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN whatsapp_phone text;
ALTER TABLE notification_preferences ADD COLUMN email_digest_enabled boolean DEFAULT false;
ALTER TABLE medications ADD COLUMN pharmacy_email text, ADD COLUMN pharmacy_name text;
ALTER TABLE carer_handover_notes ADD COLUMN photo_paths text[];
-- New bucket: handover-photos (30-day TTL)
-- New feature flags: whatsapp_fallback_enabled, photo_checkin_enabled,
--   weekly_digest_email_enabled, shift_summary_enabled, bank_connect_enabled
```

### New Env Vars (5)
```bash
WHATSAPP_BUSINESS_PHONE_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
TINK_CLIENT_ID=
TINK_CLIENT_SECRET=
```

---

## 7. THE GRANDMA TEST — Acceptance Protocol

3 Dutch adults aged 72-85, unassisted, in their homes:

| Task | Threshold |
|------|-----------|
| "Neem uw ochtendmedicijn in" | <30 seconds, 0 errors |
| "Stuur een hartje naar Sarah" | <20 seconds, 0 errors |
| "U krijgt een verdacht telefoontje" | Opens Shield, taps "Is dit echt?" <15s |
| "Check hoe het met uw dag was" | Opens Today, understands green/amber/red |

**Pass: 4/4 without asking for help.**

Stakeholder criteria: Elder takes meds unassisted 7 days. Family checks daily status pill unprompted. Carer completes handover note <90 seconds. Zero BSN/privacy incidents in 30-day trial.

---

## 8. WHAT DOES NOT CHANGE

- No BSN collection (WhatsApp/SMS/CallScreening all `assertNoBsnText`)
- No precise location to family (except emergency 30-min link)
- No companion memory family access (elder-private)
- No hard deletes (soft-delete everywhere)
- No consent bypass (WhatsApp fallback only consented family; bank requires Tink authorization)
- All Round 1-3 security fixes preserved

## APPENDIX: TOTALS

| Phase | Hours | New FNs | New Components | Migrations |
|-------|-------|---------|---------------|------------|
| Phase 1: Grandma Test | 29 | 1 | 4 | 1 |
| Phase 2: Family Reassurance | 29 | 0 | 1 | 2 |
| Phase 3: Carer Enablement | 42 | 1 | ~16 | 1 |
| Phase 4: Integrations | 102 | 2 | ~18 | 0 |
| **Total** | **202** | **4** | **~39** | **4** |
