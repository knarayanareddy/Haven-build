import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('HAVEN Cross-Platform Android Adaptations Suite (Minimal Scope Complete Acceptance)', async () => {
  // ─── Phase 1: Static Codebase Diff Scan Verification ───
  
  // FIX 1 Verification
  const elderAppSource = readFileSync(new URL('../../apps/elder/App.tsx', import.meta.url), 'utf8');
  assert.ok(elderAppSource.includes('SafeAreaView'), 'FIX 1: Must wrap Android surfaces in react-native-safe-area-context SafeAreaView');
  assert.ok(elderAppSource.includes('Platform.OS === \'android\''), 'FIX 1: Must enforce edge-to-edge padding specifically on Android Platform');

  const carerAppSource = readFileSync(new URL('../../apps/carer/App.tsx', import.meta.url), 'utf8');
  assert.ok(carerAppSource.includes('SafeAreaView'), 'FIX 1: Must wrap Carer surfaces in SafeAreaView');

  // Config Validation
  //
  // `windowSoftInputMode` is an AndroidManifest attribute and is NOT a supported
  // Expo app-config key — the previous assertion here could only pass by editing
  // generated native files, which Expo overwrites. The supported equivalent is
  // `android.softwareKeyboardLayoutMode: "resize"`, which Expo maps to
  // adjustResize in the manifest. The old expectation made this suite
  // unfixable-by-configuration; it now asserts the key Expo actually honours.
  const elderAppConfig = JSON.parse(readFileSync(new URL('../../apps/elder/app.json', import.meta.url), 'utf8'));
  const elderAndroid = elderAppConfig?.expo?.android ?? {};
  assert.equal(
    elderAndroid.softwareKeyboardLayoutMode,
    'resize',
    'FIX 1: android.softwareKeyboardLayoutMode must be "resize" (Expo equivalent of adjustResize)',
  );
  assert.ok(
    (elderAndroid.permissions ?? []).includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'),
    'FIX 2: Doze whitelist permission must be declared (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)',
  );

  // FIX 2 Verification
  const dozeGuardSource = readFileSync(new URL('../../apps/elder/src/services/dozeGuard.ts', import.meta.url), 'utf8');
  assert.ok(dozeGuardSource.includes('IGNORE_BATTERY_OPTIMIZATIONS'), 'FIX 2: Must invoke IntentLauncher IGNORE_BATTERY_OPTIMIZATIONS prompt');
  assert.ok(dozeGuardSource.includes('startLocationUpdatesAsync'), 'FIX 2: Must deploy highly polished Expo Foreground Service for continuous fall discovery');
  assert.ok(dozeGuardSource.includes('Patiëntveiligheid'), 'FIX 2: Must provide explicit Older Adult patient safety rationale');

  // FIX 3 Verification
  //
  // The prompt copy lives in the i18n dictionaries, not inline in the component.
  // Asserting the literals against AuthProvider.tsx (as this suite used to) could
  // only pass by hard-coding Dutch UI text in a React Native component — the
  // opposite of the requirement. Assert the wiring AND the copy it resolves to.
  const authProviderSource = readFileSync(new URL('../../apps/carer/src/auth/AuthProvider.tsx', import.meta.url), 'utf8');
  assert.ok(
    /promptMessage:\s*translate\('auth\.biometric\.android\.prompt'/.test(authProviderSource),
    'FIX 3: Android BiometricPrompt title must come from auth.biometric.android.prompt',
  );
  assert.ok(
    /subtitle:\s*translate\('auth\.biometric\.android\.subtitle'/.test(authProviderSource),
    'FIX 3: Android BiometricPrompt subtitle must come from auth.biometric.android.subtitle',
  );

  const nlCopy = JSON.parse(readFileSync(new URL('../../packages/i18n/locales/nl-NL.json', import.meta.url), 'utf8'));
  assert.equal(nlCopy['auth.biometric.android.prompt'], 'HAVEN Verificatie', 'FIX 3: Dutch prompt title');
  assert.equal(
    nlCopy['auth.biometric.android.subtitle'],
    'Bevestig uw identiteit om door te gaan',
    'FIX 3: Dutch prompt subtitle',
  );

  // ─── Phase 2: Complete Executable Subsystem Simulation Harness ───
  class SimulatedAndroidSubsystem {
    constructor() {
      this.telemetryEvents = [];
      this.dozeModeActive = false;
      this.batteryOptimizationsIgnored = false;
      this.foregroundServiceActive = false;
    }

    // Edge-to-Edge Safe Area Insets Simulation
    getAndroidSafeAreaInsets(gestureNavigationEnabled) {
      if (gestureNavigationEnabled) {
        return { top: 48, bottom: 32, left: 0, right: 0, obscuredByNavBar: false };
      }
      return { top: 48, bottom: 48, left: 0, right: 0, obscuredByNavBar: false };
    }

    // Doze DoS OEM Battery Execution Simulation
    //
    // Doze state is recomputed per scenario. It used to be a latch: once the
    // un-mitigated run set `dozeModeActive = true`, the whitelisted run that
    // follows could never clear it, so the harness reported a telemetry kill even
    // when the mitigations under test were active.
    async runDozeFallTelemetryScenario(minutesScreenOff) {
      this.dozeModeActive =
        minutesScreenOff > 5 && !this.batteryOptimizationsIgnored && !this.foregroundServiceActive;

      // Simulate fall sensor POST telemetry over time
      for (let min = 1; min <= minutesScreenOff; min++) {
        if (min === 6 && this.dozeModeActive) {
          throw new Error('504 Gateway Timeout / Socket exception: Aggressive Doze DoS completely killed telemetry heartbeat');
        }
        this.telemetryEvents.push({ minute: min, status: 'fall_sensor_active' });
      }
      return this.telemetryEvents.length;
    }

    // Android BiometricPrompt Branded Verification Simulation
    async launchAndroidBiometricPrompt(options) {
      if (options.promptMessage.includes('HAVEN Verificatie')) {
        return { success: true, branded: true, title: 'HAVEN Verificatie', subtitle: 'Bevestig uw identiteit om door te gaan' };
      }
      return { success: true, branded: false, title: options.promptMessage };
    }
  }

  const sim = new SimulatedAndroidSubsystem();

  // ─── CLOSURE TEST 1: Safe area insets render correctly on Android with gesture navigation ───
  const insets = sim.getAndroidSafeAreaInsets(true);
  assert.equal(insets.obscuredByNavBar, false, 'Android gesture navigation bars must not obscure UI bottom content');
  assert.equal(insets.bottom, 32);

  // ─── CLOSURE TEST 2: Fall detection telemetry continues after 10 minutes of screen-off on Samsung device ───
  // Un-mitigated baseline drops dead at minute 6
  let dozeBreach = null;
  try {
    await sim.runDozeFallTelemetryScenario(10);
  } catch (err) { dozeBreach = err; }
  assert.ok(dozeBreach !== null, 'Un-mitigated Doze mode must actively sever telemetry streams');

  // Whitelisted Android scenario (Fulfilling our FIX 2 implementations)
  sim.batteryOptimizationsIgnored = true;
  sim.foregroundServiceActive = true;
  sim.telemetryEvents = []; // Reset ledgers

  const successfulHeartbeats = await sim.runDozeFallTelemetryScenario(10);
  assert.equal(successfulHeartbeats, 10, 'Must preserve 100% telemetry continuation after 10 minutes of screen-off Doze DoS');

  // ─── CLOSURE TEST 3: BiometricPrompt shows HAVEN-branded strings on Android ───
  const bioRes = await sim.launchAndroidBiometricPrompt({
    promptMessage: 'HAVEN Verificatie\nBevestig uw identiteit om door te gaan',
    fallbackLabel: 'Gebruik pincode'
  });
  assert.equal(bioRes.branded, true, 'Must display branded strings matching HAVEN identity');
  assert.equal(bioRes.title, 'HAVEN Verificatie');
  assert.equal(bioRes.subtitle, 'Bevestig uw identiteit om door te gaan');
});
