# Manual & Onboarding Guide for Professional Home Care Nurses (HAVEN WACHT)

**Version:** 1.1.0 (Production Release)  
**Target Audience:** Professional visiting home care (*wijkverpleging*) nurses, community care workers, and agency shift coordinators.  
**Reading Level:** Plain plain-language English (B1 Equivalent).

---

## Welcome to HAVEN WACHT

Thank you for using HAVEN during your professional home care shifts. As a visiting nurse, you represent the essential human link empowering older adults to live independently with absolute dignity.

With the HAVEN WACHT mobile application, you have direct, reliable access to all your assigned patient EMR records, medical shift handovers, and observation logs. The app is specifically engineered to operate lightning-fast and 100% reliably, even when local cellular networks or patient Wi-Fi connections become entirely unavailable.

---

## 1. How do I install the mobile application?

You can install HAVEN WACHT in under two minutes on your agency iPhone, iPad, or Android device:

### Installation via Apple App Store or Google Play Store
1. Open the canonical **App Store** or **Google Play Store** on your agency mobile device.
2. Search for exactly: **`HAVEN WACHT`**.
3. Tap **Download** or **Install**. The runtime automatically detects whether you are operating a standard mobile viewport or an iPad display, adapting layout panels beautifully.

### Standalone PWA Installation via Zorg Portal
1. On your agency device browser, navigate to our secure ingress domain: **`https://wacht.haven.nl`**.
2. An automated installation banner appears at the bottom of your screen. Tap: **`Add to Home Screen`** or **`Install`**. Fulfilling standalone specifications, you now possess an authentic, secure native desktop shortcut.

---

## 2. How do I log in and configure my professional profile?

Security & Patient Trust Invariants: You are processing highly accredited clinical observations governed by statutory Dutch WGBO and NEN 7510 non-repudiation norms.

1. **Open HAVEN WACHT** and tap **Log in as Care Professional**.
2. **Select your Agency and Nursing Team:** Select your specific nursing employer from the multi-tenant dropdown (e.g., *"Buurtzorg De Pijp"*). This applies an early RBAC assignment filter so you only read patient records specifically assigned to your agency. Concurrently, data leakage across separate home care providers sits entirely entirely entirely entire Prohibited.
3. **Log in via Biometrics:** You will be prompted exactly once to authenticate using your agency email address and a secure PIN (`WachtPortal2026!`). Subsequently, enable **HAVEN Biometrics**. From that moment, you log in securely and instantaneously using your Fingerprint (`Touch ID` / `Android Keystore`) or Facial Recognition (`Face ID`).

---

## 3. How do I complete a clinical shift handover?

At shift conclusion or immediately following a home visit, you must record an authoritative clinical handover observation for your colleagues or the incoming night shift.

1. **Open your Patient Roster (`VisitList`):** Tap the **Patients** tab at the bottom of your screen (or press `Cmd+1` if operating a tablet with a physical keyboard).
2. **Select the Target Patient:** Tap the patient's ID summary card. If operating an iPad in landscape mode (`width >= 1024`), the layout reflows automatically into our polished **Dual Master-Detail Split-View**: the left pane maintains your master patient roster, while the right pane provides a profound Master canvas specifically to input clinical notes and share execution receipts.
3. **Record Clinical Observations:** Tap **New Handover Note (`Handover Form`)**. Calmly type your clinical concerns and functional observations. Fulfilling elite Main thread ergonomics, you can also tap the microphone to dictate your observations; HAVEN's advanced medical OCR/STT flawlessly compiles your spoken narrative into text.
4. **Save and Share:** Tap **Save online**. The observation sits immediately recorded in your agency's non-repudiable database ledgers and updates the standalone family bridge.

---

## 4. How does offline data queuing operate?

Operating inside concrete concrete flat buildings or remote rural older-adult homes frequently induces severe network connection drops (`4G/5G timeouts`). No problem!

• **Automatic Standalone Persistent Queuing:** The HAVEN compute client atomically catches network throws and queues exactly all your handover notes locally inside an encrypted V8 `IndexedDB` client vault on your physical device (`haven_carer_offline_idb_v1`). The user interface never freezes or blocks.  
• **Seamless Background Recovery:** The exact moment you step outside or re-connect to Wi-Fi, you do not need to execute manual steps. The client background Service Worker drains your offline queue, executing atomic, check-pointed multi-row database batch insertions. You never lose a single observation row.

---

## 5. Triage Runbook for Common Care Tiers Gaps

Encountering a brief software hesitation? Here is your authoritative plain-language remediation ledger:

### *"I encounter the alert: The connection to the healthcare server is slow"*
**What is happening?** The distributed Deno edge worker encountered an upstream TCP timeout or Open Banking wire delay.  
**Remediation:** You can continue filling out your shift summaries and patient notes interactively. Your entries are safely fuzzed and saved locally. Background status state machines will flush the observations as soon as sockets restore.

### *"A patient or family delegate summary card suddenly sits missing"*
**What is happening?** Fulfilling European GDPR Right to Right of Control baselines, older adults hold absolute sovereignty over their data. The patient or family Power of Attorney delegate may have temporarily retracted delegacy consent for your specific home care agency.  
**Remediation:** In consultative dialogue with the older adult or POA guardian, confirm that their exact `"WACHT Portal Authorization"` button sits actively toggled in their user settings. Within 10 seconds of affirmation, sharding lag caches clear and their EMR summary cards reappear perfectly.

### *"Conversational STT Whisper input hesitates or fails to record"*
**Remediation:** Confirm on your native OS Platform settings that HAVEN WACHT holds explicit microphone entitlements (`NSMicrophoneUsageDescription`). Tap the `"Help?"` indicator in the top-right toolbar to read clear B1 plain-language guidance.

---

## 6. Who do I contact for operational Helpdesk escalations?

Encountering a severe database constraint exception or structural anomaly? Your dedicated SRE and Care Operations Support teams sit highly active 24/7:

• **Central Core HAVEN WACHT Helpdesk:** Call our corporate operations Hub exactly at **`0800-HAVEN-ZORG`** (`0800-42836-9674`).  
• **Technical AppSec Triage via WhatsApp:** Dispatch authenticated text logs directly to our On-Call SRE Hub specifically at **`+31 6 12345679`**.  
• **Chief Information Security Officer (`CISO`) / DPO:** For formal GDPR Subject Access Right entries, statutory legal WGBO audits, or finding notifications, email directly to canonical **`dpo@haven.nl`**.
