import React, { useEffect, useMemo } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productionScreens } from '@haven/schema/src/screenSchema';
import { ScreenRenderer, ScreenContext, ElderProfile, FamilyMember, MedicationRow, TaskRow, MessageRow, ScamEventRow, BuurtRow, VisitLogRow } from '../renderer/ScreenRenderer';
import { ElderStackParamList } from '../navigation/AppNavigator';
import { useHavenActions } from '../hooks/useHavenActions';
import { useAuth } from '../auth/AuthProvider';
import { initializeAndroidDozeGuard } from '../services/dozeGuard';

type Props = NativeStackScreenProps<ElderStackParamList>;

const DEMO_ELDER_ID = '00000000-0000-0000-0000-000000000001';

function loadSeed(): {
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
      locale: 'nl-NL',
      postCode4: '1072',
      safeZoneLabel: 'Thuis — De Pijp',
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
      { id: 'task-1', icon: '🏥', title: 'Huisartsafspraak met dr. van der Linden', subtitle: '14:00 · Sarah', done: false },
      { id: 'task-2', icon: '🚶', title: 'Korte wandeling na de lunch', subtitle: '13:15 · HAVEN', done: false },
      { id: 'task-3', icon: '📞', title: 'Apotheek bellen voor refill', subtitle: 'overmorgen 10:00', done: false },
    ],
    messages: [
      { id: 'msg-1', from: 'Sarah', kind: 'text', body: 'Ik denk vanochtend aan u. Ik bel na mijn werk.', unread: true },
      { id: 'msg-2', from: 'Lucas', kind: 'video', body: 'Videogroet van kleinkind opgeslagen voor vandaag.', unread: true },
      { id: 'msg-3', from: 'Sarah', kind: 'voice', body: 'Spraakbericht over het weekoverzicht.', unread: false },
      { id: 'msg-4', from: 'Margreet', kind: 'text', body: 'Hartelijke groet aan Sarah en Lucas.', unread: false },
    ],
    scamEvents: [
      { id: 'scam-1', level: 'amber', channel: 'phone', score: 52, explanation: 'lemand belde en vroeg naar uw bankpas. Geef nooit codes door.', notified: true },
      { id: 'scam-2', level: 'rood', channel: 'whatsapp', score: 82, explanation: 'Een bekende lijkt in nood maar het account is mogelijk overgenomen. Bel uw familie eerst.', notified: true },
    ],
    buurt: {
      active: true,
      nearbyCount: 3,
      tags: ['Tuinieren', 'Wandelen', 'Lezen', 'Muziek', 'Koken'],
      walkBuddyCount: 2,
      events: [
        { id: 'evt-1', title: 'Gratis koffieochtend', distanceLabel: '600 m', date: 'Vrijdag 10:00' },
        { id: 'evt-2', title: 'Wandelgroep ouderen', distanceLabel: '1.2 km', date: 'Zondag 14:00' },
      ],
    },
    visits: [
      { date: 'gisteren', carer: 'Nurse Eva de Boer (Buurtzorg)', note: 'Medicatiecontrole afgerond. Stemming rustig.' },
      { date: '8 dagen geleden', carer: 'Nurse Eva de Boer (Buurtzorg)', note: 'Refill Metformine aangevraagd.' },
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
  const seed = useMemo(() => loadSeed(), []);
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
  void session; // session is reserved for live API calls in actions.handlePrimaryAction
  return <ScreenRenderer schema={schema} context={ctx} />;
}
