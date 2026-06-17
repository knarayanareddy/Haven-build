# Authoritative HAVEN Android Emulator (AVD) Testing Guide

In accordance with our multi-platform readiness milestones, this runbook establishes the exact First-Principles testing procedures to verify **HAVEN** frontend surfaces (`apps/elder`, `apps/carer`) on Google Android architectures.

This guide explicitly details how to prove that our Edge-to-Edge Navigation Safe Area wrapping (`SafeAreaView`), local SQLite offline sync engines, Android `BiometricPrompt` customized branded strings, and automated Android Doze battery Whitelisting (`dozeGuard.ts`) entirely eliminate platform fragmentation and `Doze DoS` vulnerability windows.

---

## 5. Testing Guide on Android Emulator (AVD)

### 1. Launch AVD Device with SDK Concurrency Parity
Open an execution terminal and launch your configured Android Virtual Device (running exactly API Level 34 with zero simulated socket latency):
```bash
emulator -avd Haven_OlderAdult_API_34 -netdelay none -netspeed full
```

### 2. Execute Multi-Modal Build Protocol
From the monorepo root directory, install all synchronized deterministic packages and invoke the Expo multi-modal Android compilation drivers:
```bash
corepack pnpm install
corepack pnpm run android --filter @haven/elder-app
```
*(To verify the accredited visiting nurse interface, substitute `--filter @haven/carer`).*

### 3. Trigger Inactive Doze Execution Testing via Local ADB Socket Gateways
On un-mitigated mobile devices, aggressive OEM battery management (*Doze mode*) actively severs underlying network threads and kills background emergency fall location discovery. 

To empirically prove that our newly implemented amazing **Foreground Service** (`FALL_LOCATION_TASK`) and **Battery Whitelist Prompt** (`IGNORE_BATTERY_OPTIMIZATIONS`) entirely block `Doze DoS` P0 life-safety hazards, force the emulator into immediate Doze Deep Idle status:
```bash
adb shell dumpsys deviceidle force-idle
```

### 4. Assert exactly 0 Interrupted Heartbeats
With the emulator locked in Deep Idle, monitor your active management console and SIEM telemetry drains. 

**Definitive Acceptance Standard:** You MUST assert perfect exactly exactly exactly un-severed continuous life-safety Fall events and exactly `0` dropped geospatial network updates over a continuous 10-minute testing verification enclosure.
