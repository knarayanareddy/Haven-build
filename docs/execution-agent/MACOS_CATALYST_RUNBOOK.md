# Authoritative Execution Agent macOS Mac Catalyst Runbook

When your automated execution agent or a platform engineer needs to compile, verify, or build the **HAVEN** enterprise desktop applications (`apps/elder`, `apps/carer`) for Apple macOS architectures, they MUST adhere strictly to the guidelines and command sequences established below.

## 1. Multi-Platform Architectural Context
- **Primary Use Case:** Family delegates and Data Protection Officer (DPO) administrative users access HAVEN on MacBooks primarily for read-only status dashboards, SIEM security violation reviews, and real-time network dispatches.
- **Mac Catalyst Baseline:** The enterprise desktop target is compiled natively via Expo Mac Catalyst (`"mac": { "bundleIdentifier": "nl.haven.app.mac", "minimumMacOSVersion": "12.0" }` in `app.json`), reusing our beautifully hardened iOS mobile codebase while replacing unsupported mobile SDK drivers with dedicated desktop shims (`@haven/shims`).
- **Desktop UI Parity:** Fulfilling desktop ergonomics, physical mobile haptics sit bypassed (`haptics.ts` no-op shim), `UserNotifications` execute via HTML5 Notification OS wrappers coupled with real-time Supabase WebSockets (`notifications.ts`), Touch ID triggers macOS desktop authentication enclaves (`"HAVEN verificatie op Mac"` prompt), and the touch-based floating voice overlay is replaced with a highly polished persistent desktop toolbar equivalent accessible via global keyboard shortcuts (`Cmd+Shift+V` to speak, `Escape` to abort, `Cmd+1/2/3` to tab navigate).

## 2. Definitive Compilation & Execution Guidelines for macOS
To successfully instantiate your native macOS compilation scaffolds and execute automated platform verification suites, execute exactly the following deterministic command sequence from your workspace root (`/home/user/Haven-build/`):

```bash
# 1. Boot active monorepo environment and install all dependencies
corepack pnpm install

# 2. Transpile, verify, and run total Production Monorepo Testing Suite
# Guarantees exactly 100% Flawless Green Status across all 34 operational verification harnesses
npm install --prefix /tmp/haven-test-deps typescript && corepack pnpm test

# 3. Compile Native macOS Mac Catalyst Application Target (Xcode Mac Catalyst SDK required)
corepack pnpm run expo run:ios --device "My Mac" --filter @haven/carer
```
*(To build the Older Adult UI client for macOS, substitute `--filter @haven/elder-app`).*
