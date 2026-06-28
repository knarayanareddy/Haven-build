---
name: testing-haven-mobile
description: Test Haven mobile apps (elder, carer, grandchild) end-to-end on Android emulator. Use when verifying APK builds, UI rendering, navigation, or interactive features.
---

# Testing Haven Mobile Apps

## Prerequisites

- Android SDK installed at `$ANDROID_HOME` (typically `/home/ubuntu/android-sdk`)
- KVM enabled for hardware-accelerated emulation (`sudo chmod 666 /dev/kvm`)
- An Android emulator AVD created (API 34+ recommended, x86_64 system image)

## Devin Secrets Needed

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL (repo-scoped)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key (repo-scoped)

## Setup Steps

### 1. Android SDK & Emulator

```bash
# Install SDK components if not present
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "system-images;android-36;google_apis;x86_64" "emulator"

# Create AVD (if not exists)
echo "no" | $ANDROID_HOME/cmdline-tools/latest/bin/avdmanager create avd \
  -n test -k "system-images;android-36;google_apis;x86_64" --force

# Start emulator in background (headless for CI, or with display for recording)
$ANDROID_HOME/emulator/emulator -avd test -no-audio -gpu swiftshader_indirect &
adb wait-for-device
```

### 2. Build APKs

Each app needs `expo prebuild` then Gradle build. From repo root:

```bash
# Create .env files with Supabase credentials in each app dir
for app in carer elder grandchild; do
  cat > apps/$app/.env <<EOF
EXPO_PUBLIC_SUPABASE_URL=<your-supabase-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
EOF
done

# Prebuild and build release APKs
for app in carer elder grandchild; do
  cd apps/$app
  npx expo prebuild --platform android --clean
  cd android && ./gradlew assembleRelease
  cd ../../..
done
```

**Important:** Build release APKs, not debug. Debug APKs require a running Metro server and won't work standalone.

### 3. Install APKs

```bash
adb install -r apps/carer/android/app/build/outputs/apk/release/app-release.apk
adb install -r apps/elder/android/app/build/outputs/apk/release/app-release.apk
adb install -r apps/grandchild/android/app/build/outputs/apk/release/app-release.apk
```

## App Package Names

- Elder: `nl.haven.elder`
- Carer: `nl.haven.carer`
- Grandchild: `nl.haven.grandchild`

Launch with: `adb shell am start -n <package>/.MainActivity`

## What to Test

### Elder App (10 screens)
- **Primary tabs** (bottom nav): HAVEN (home), Vandaag, Mijn Pillen, Schild, Familie, Meer
- **Secondary screens** (via Meer): Uw Buurt, Kompas, Stem, Zorg, Instellingen
- **Interactive elements**: SOS button (red, bottom-right), Help overlay (? button, top-right), FloatingVoiceButton (mic, bottom-left on primary screens)
- **SOS** should trigger "Bellen 112 wordt voorbereid..." alert
- **Help overlay** should show screen title, help text, green SOS hint, close button
- **Settings** should have language toggle, high contrast toggle, font size button

### Carer App (2 tabs)
- **Bottom tabs**: Visits (VisitList) and Overdracht (ShiftSummary)
- **Without auth**: Shows "Log in om live bezoeken te laden." on Visits, similar on Overdracht
- **FloatingVoiceButton** present on Overdracht tab
- **HandoverForm**: Only accessible when navigating from a visit (requires auth)

### Grandchild App (1 screen)
- **Form**: 4 text inputs (Elder profile ID, Family member ID, Grandchild display name, Family access token) + purple "Send hello" button
- **Validation**: Empty submit shows red error: "Supabase URL, elder ID, family member ID, display name, and access token are required."
- **Consent notice**: Bottom text about guardian and elder consent

## Known Issues & Workarounds

- **Battery optimization dialog**: The elder app may show "HAVEN Patientveiligheid" dialog on every screen change. This is an Android system dialog requesting battery optimization exemption. Dismiss with "LATER" and continue testing. This is a known UX issue (should only show once).
- **expo-av incompatibility**: If the elder app crashes with `LazyKType` error, `expo-av` needs to be replaced with `expo-audio` (SDK 56 successor). The migration is in `voiceRecorder.ts`.
- **Carer entry point**: The carer `package.json` `main` field must be `"expo/AppEntry.js"`, not `"App.tsx"`. Without this, the app renders a white screen because `registerRootComponent()` is never called.
- **Supabase null guard**: The elder app's `AuthProvider.tsx` must handle missing `EXPO_PUBLIC_SUPABASE_URL` gracefully (return null client) or the app crashes on startup.
- **Gradle cache contamination**: When building multiple apps sequentially, clean Gradle caches between apps if you encounter `NoClassDefFoundError`. Run `cd android && ./gradlew clean` before rebuilding.

## Testing Without Auth

Without a logged-in user, apps show empty/default states:
- Elder: "elder.defaultName" greeting, 0 pills, 0 messages, 0 tasks
- Carer: "Vandaag (0)" with login prompt
- Grandchild: Form renders fully (it only contacts Supabase on "Send hello" tap)

To test with auth, you'd need to create a user account in Supabase and implement a login flow in the app.
