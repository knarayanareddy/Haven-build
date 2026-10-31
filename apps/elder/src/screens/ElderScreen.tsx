import React, { useEffect, useMemo } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { useTranslation } from '@haven/i18n';
import type { Locale } from '@haven/contracts/src/haven';
import { ScreenRenderer, ScreenContext, ElderProfile, FamilyMember, MedicationRow, TaskRow, MessageRow, ScamEventRow, BuurtRow, VisitLogRow } from '../renderer/ScreenRenderer';
import { ElderStackParamList } from '../navigation/AppNavigator';
import { useHavenActions } from '../hooks/useHavenActions';
import { useAuth } from '../auth/AuthProvider';
import { initializeAndroidDozeGuard } from '../services/dozeGuard';
import { HavenClient } from '../services/havenClient';
import { useScreenData } from '../hooks/useScreenData';

type Props = NativeStackScreenProps<ElderStackParamList>;

function sessionUserId(session: { access_token?: string } | null): string | null {
  const directUser = (session as unknown as { user?: { id?: string } } | null)?.user?.id;
  if (directUser) return directUser;
  const token = session?.access_token;
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload))?.sub ?? null;
  } catch {
    return null;
  }
}

/**
 * The skeleton an offline launch renders before (or without) data.
 *
 * Empty on purpose: it used to be the *only* source for every screen, which is why a signed-in
 * elder saw zeros everywhere. Real values come from `useScreenData`.
 */
function loadShell(elderId: string, locale: Locale, t: any): {
  profile: ElderProfile;
  family: FamilyMember[];
  medications: MedicationRow[];
  tasks: TaskRow[];
  messages: MessageRow[];
  scamEvents: ScamEventRow[];
  buurt: BuurtRow;
  visits: VisitLogRow[];
} {
  return {
    profile: {
      id: elderId,
      preferredName: t('elder.defaultName'),
      locale: locale,
      postCode4: '',
      safeZoneLabel: t('seed.safeZone'),
    },
    family: [],
    medications: [],
    tasks: [],
    messages: [],
    scamEvents: [],
    buurt: {
      active: false,
      nearbyCount: 0,
      tags: [],
      walkBuddyCount: 0,
      events: [],
    },
    visits: [],
  };
}

export function ElderScreen({ route, navigation }: Props) {
  useEffect(() => {
    initializeAndroidDozeGuard().catch(() => undefined);
  }, []);
  const schema = productionScreens.find((screen) => screen.screenId === route.name) ?? productionScreens[0];
  const actions = useHavenActions(schema.screenId);
  const { session } = useAuth();
  const { locale, t } = useTranslation();
  const elderId = sessionUserId(session) ?? 'signed-out';
  const seed = useMemo(() => loadShell(elderId, locale, t), [elderId, locale, t]);

  // Keyed on the token, not the session object: the auth provider hands back a fresh object on
  // every render, and a client that changes identity each time would re-run the loader forever.
  const accessToken = session?.access_token ?? null;
  const client = useMemo(
    () => (accessToken ? new HavenClient({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!, accessToken }) : null),
    [accessToken]
  );
  const data = useScreenData({
    client,
    elderId: sessionUserId(session),
    screenId: schema.screenId,
    locale,
  });

  const ctx: ScreenContext = {
    locale: seed.profile.locale,
    now: new Date(),
    profile: seed.profile,
    // Loaded data wins; the shell only carries the profile identity and an empty fallback.
    family: data.family,
    medications: data.medications,
    tasks: data.tasks,
    messages: data.messages,
    scamEvents: data.scamEvents,
    buurt: data.buurt,
    visits: data.visits,
    pendingConfirmation: data.pendingConfirmation,
    onPrimaryAction: (actionId: string) => {
      if (actionId.startsWith('NAV_')) {
        const target = actionId.replace('NAV_', '');
        navigation.navigate(target);
        return;
      }
      actions.handlePrimaryAction(actionId);
    },
  };
  void session;
  return <ScreenRenderer schema={schema} context={ctx} />;
}
