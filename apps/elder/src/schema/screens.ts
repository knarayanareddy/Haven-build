export interface ElderScreenContract {
  id: string;
  titleEn: string;
  titleNl: string;
  pillar: 'SCHILD' | 'ANKER' | 'KRING' | 'BUURT' | 'KOMPAS' | 'STEM' | 'WACHT' | 'PLATFORM';
  depthFromHome: 0 | 1 | 2;
  maxPrimaryItems: number;
  bottomActions: number;
  emergencyButton: boolean;
  backend: string[];
}

export const elderScreens: ElderScreenContract[] = [
  { id: 'HOME', titleEn: 'HAVEN', titleNl: 'HAVEN', pillar: 'PLATFORM', depthFromHome: 0, maxPrimaryItems: 4, bottomActions: 1, emergencyButton: true, backend: ['fn-screen-data'] },
  { id: 'TODAY', titleEn: 'Today', titleNl: 'Vandaag', pillar: 'ANKER', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['tasks', 'appointments'] },
  { id: 'PILLS', titleEn: 'My Pills', titleNl: 'Mijn Pillen', pillar: 'ANKER', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['medications', 'medication_reminders', 'fn-medication-ocr'] },
  { id: 'SHIELD', titleEn: 'Shield', titleNl: 'Schild', pillar: 'SCHILD', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['scam_events', 'fn-scam-pipeline', 'fn-transaction-intercept'] },
  { id: 'FAMILY', titleEn: 'Family', titleNl: 'Familie', pillar: 'KRING', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['family_messages', 'life_stories', 'fn-family-message-send'] },
  { id: 'BUURT', titleEn: 'Neighbourhood', titleNl: 'Uw Buurt', pillar: 'BUURT', depthFromHome: 2, maxPrimaryItems: 4, bottomActions: 2, emergencyButton: true, backend: ['fn-buurt-discover', 'fn-buurt-match'] },
  { id: 'KOMPAS', titleEn: 'Compass', titleNl: 'Kompas', pillar: 'KOMPAS', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['fn-location-ingest', 'fn-emergency-profile', 'cognitive_checkins'] },
  { id: 'STEM', titleEn: 'Voice Companion', titleNl: 'Spraakmetgezel', pillar: 'STEM', depthFromHome: 1, maxPrimaryItems: 2, bottomActions: 2, emergencyButton: true, backend: ['fn-voice-pipeline', 'fn-companion-memory'] },
  { id: 'WACHT', titleEn: 'Care', titleNl: 'Zorg', pillar: 'WACHT', depthFromHome: 2, maxPrimaryItems: 3, bottomActions: 2, emergencyButton: true, backend: ['carer_visit_logs', 'incidents'] },
  { id: 'SETTINGS', titleEn: 'Settings', titleNl: 'Instellingen', pillar: 'PLATFORM', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: 0, emergencyButton: true, backend: ['fn-consent-update', 'fn-feature-flags', 'fn-right-to-erasure'] },
];

export function assertElderUxConstitution() {
  for (const screen of elderScreens) {
    if (screen.depthFromHome > 2) throw new Error(`${screen.id} is too deep`);
    if (screen.bottomActions > 2) throw new Error(`${screen.id} has too many actions`);
    if (screen.maxPrimaryItems > 4) throw new Error(`${screen.id} has too many primary items`);
    if (!screen.emergencyButton) throw new Error(`${screen.id} lacks emergency access`);
  }
  return true;
}
