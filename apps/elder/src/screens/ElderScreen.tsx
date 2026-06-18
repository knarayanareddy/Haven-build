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

type Props = NativeStackScreenProps<ElderStackParamList>;

const DEMO_ELDER_ID = '00000000-0000-0000-0000-000000000001';

function loadSeed(locale: Locale, t: any): {
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
      id: DEMO_ELDER_ID,
      preferredName: 'Margreet',
      locale: locale,
      postCode4: '1072',
      safeZoneLabel: t('seed.safeZone'),
    },
    family: [
      { id: 'fm-sarah', name: 'Sarah Bakker', relation: 'kind', isPrimary: true },
      { id: 'fm-lucas', name: 'Lucas Bakker', relation: 'kleinkind' },
      { id: 'fm-eva', name: 'Nurse Eva de Boer', relation: 'andere' },
    ],
    medications: [
      { id: 'med-1', name: 'Metformine', dose: '500 mg', descriptionNl: 'Witte ovale pil voor bloedsuiker', descriptionEn: 'White oval pill for blood sugar', time: '08:00', status: 'planned', stock: 18 },
      { id: 'med-2', name: 'Lisinopril', dose: '10 mg', descriptionNl: 'Kleine perzikkleurige pil voor bloeddruk', descriptionEn: 'Small peach pill for blood pressure', time: '08:00', status: 'planned', stock: 23 },
      { id: 'med-3', name: 'Vitamine D', dose: '20 mcg', descriptionNl: 'Kleine gele tablet voor botten', descriptionEn: 'Tiny yellow tablet for bones', time: '18:00', status: 'planned', stock: 42 },
    ],
    tasks: [
      { id: 'task-1', icon: '🏥', title: t('seed.task1.title'), subtitle: '14:00 · Sarah', done: false },
      { id: 'task-2', icon: '🚶', title: t('seed.task2.title'), subtitle: '13:15 · HAVEN', done: false },
      { id: 'task-3', icon: '📞', title: t('seed.task3.title'), subtitle: t('seed.task3.subtitle'), done: false },
    ],
    messages: [
      { id: 'msg-1', from: 'Sarah', kind: 'text', body: t('seed.msg1.body'), unread: true },
      { id: 'msg-2', from: 'Lucas', kind: 'video', body: t('seed.msg2.body'), unread: true },
      { id: 'msg-3', from: 'Sarah', kind: 'voice', body: t('seed.msg3.body'), unread: false },
      { id: 'msg-4', from: 'Margreet', kind: 'text', body: t('seed.msg4.body'), unread: false },
    ],
    scamEvents: [
      { id: 'scam-1', level: 'amber', channel: 'phone', score: 52, explanation: t('seed.scam1.explanation'), notified: true },
      { id: 'scam-2', level: 'rood', channel: 'whatsapp', score: 82, explanation: t('seed.scam2.explanation'), notified: true },
    ],
    buurt: {
      active: true,
      nearbyCount: 3,
      tags: [t('seed.buurt.tag1'), t('seed.buurt.tag2'), t('seed.buurt.tag3'), t('seed.buurt.tag4'), t('seed.buurt.tag5')],
      walkBuddyCount: 2,
      events: [
        { id: 'evt-1', title: t('seed.buurt.evt1.title'), distanceLabel: '600 m', date: t('seed.buurt.evt1.date') },
        { id: 'evt-2', title: t('seed.buurt.evt2.title'), distanceLabel: '1.2 km', date: t('seed.buurt.evt2.date') },
      ],
    },
    visits: [
      { date: t('seed.visit1.date'), carer: 'Nurse Eva de Boer (Buurtzorg)', note: t('seed.visit1.note') },
      { date: t('seed.visit2.date'), carer: 'Nurse Eva de Boer (Buurtzorg)', note: t('seed.visit2.note') },
    ],
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
  const seed = useMemo(() => loadSeed(locale, t), [locale, t]);
  const ctx: ScreenContext = {
    locale: seed.profile.locale,
    now: new Date(),
    profile: seed.profile,
    family: seed.family,
    medications: seed.medications,
    tasks: seed.tasks,
    messages: seed.messages,
    scamEvents: seed.scamEvents,
    buurt: seed.buurt,
    visits: seed.visits,
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
