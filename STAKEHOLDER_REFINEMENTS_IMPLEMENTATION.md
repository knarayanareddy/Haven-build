# HAVEN — Stakeholder Refinements Implementation

**Goal**: Implement the thoughtful refinements identified from Elder, Family, and Carer perspectives.

**Approach**: Meticulous, one refinement at a time, with clear documentation.

---

## Phase 1: Elder Perspective Refinements

### Refinement 1.1: Unified Daily Rhythm Voice Prompt ("How is today going?")

**Current State**  
The elder app has separate check-in cards (morning/midday/evening) triggered via `wellness_checkins`.

**Implementation**:
- Add a new prominent voice command and button on the **VANDAAG** screen.
- When triggered, it opens a single guided flow that surfaces the three check-ins in sequence.
- Uses existing `fn-wellness-checkin` Edge Function.

**Files to Modify**:
- `apps/elder/src/screens/ElderScreen.tsx`
- `apps/elder/src/hooks/useHavenActions.ts`

**Status**: To be implemented

---

### Refinement 1.2: "What did I do yesterday?" Memory Recap

**Current State**  
Companion memory exists but is only used internally by the voice pipeline.

**Implementation**:
- New voice command + screen element: “Wat deed ik gisteren?”
- Pulls the most recent companion memory entries (last 24–48 hours).
- Presents 2–3 gentle memory snippets in a calm voice + text.

**Files to Modify**:
- `apps/elder/src/hooks/useHavenActions.ts`
- New helper in `apps/elder/src/services/companionMemory.ts`

**Status**: To be implemented

---

### Refinement 1.3: Enforce Emergency Button Position in Schema Validator

**Current State**  
The validator checks for presence but not position.

**Implementation**:
- Update the screen schema validator to require `persistentElements.emergencyButtonPosition = "bottom-right"` on all non-modal screens.

**Files to Modify**:
- `packages/schema/src/validator.ts`

**Status**: To be implemented

---

## Phase 2: Family Perspective Refinements

### Refinement 2.1: Prominent Quiet Day Detection Alert

**Implementation**:
- Enhance `TrustSignalPanel.tsx` to show a clear but calm “Quiet Day Detected” indicator when the flag is enabled and baseline is breached.

**Files to Modify**:
- `apps/family/src/components/TrustSignalPanel.tsx`

**Status**: To be implemented

---

### Refinement 2.2: Weekly Trend Summary (Plain Language)

**Implementation**:
- Add a new component `WeeklyTrendSummary.tsx` in the family dashboard.
- Generates 3–4 sentence natural language summary using existing data (scam events, medication adherence, wellness scores, family interactions).

**Files to Modify**:
- `apps/family/src/components/WeeklyTrendSummary.tsx`
- Integrate into main dashboard

**Status**: To be implemented

---

## Phase 3: Carer Perspective Refinements (WACHT)

### Refinement 3.1: Photo Attachment in Handover Notes

**Implementation**:
- Add file input + preview in `apps/carer-portal/index.html`
- Store photo path and send with `fn-carer-handover-note`

**Status**: Already partially implemented in previous fix round

---

### Refinement 3.2: Auto-generated Shift Summary Button

**Implementation**:
- Add “Generate Shift Summary” button in carer portal
- Aggregates today’s handover notes into a professional summary

**Status**: Already partially implemented in previous fix round

---

### Refinement 3.3: Medication Interaction Alerts in Carer Portal

**Implementation**:
- Add new section in WACHT portal that displays active `medication_interaction_alerts`

**Files to Modify**:
- `apps/carer-portal/index.html`

**Status**: To be implemented

---

**This document serves as the implementation roadmap.** All refinements will be executed methodically with proper testing and documentation.