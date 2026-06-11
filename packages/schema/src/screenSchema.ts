export type ScreenId = 'HOME' | 'TODAY' | 'PILLS' | 'SHIELD' | 'FAMILY' | 'BUURT' | 'KOMPAS' | 'STEM' | 'WACHT' | 'SETTINGS';

export interface ScreenSchema {
  screenId: ScreenId;
  titleEn: string;
  titleNl: string;
  depthFromHome: 0 | 1 | 2;
  maxPrimaryItems: number;
  bottomActions: Array<{ id: string; labelEn: string; labelNl: string; accessibilityLabel: string }>;
  emergencyButton: boolean;
  voiceFallbackEn: string;
  voiceFallbackNl: string;
  offlineCacheTtlSeconds: number;
}

export const productionScreens: ScreenSchema[] = [
  { screenId: 'HOME', titleEn: 'HAVEN', titleNl: 'HAVEN', depthFromHome: 0, maxPrimaryItems: 4, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'How can I help?', voiceFallbackNl: 'Waarmee kan ik helpen?', offlineCacheTtlSeconds: 300 },
  { screenId: 'TODAY', titleEn: 'Today', titleNl: 'Vandaag', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [{ id: 'hear', labelEn: 'Hear my day', labelNl: 'Lees mijn dag', accessibilityLabel: 'Hear the daily brief' }], emergencyButton: true, voiceFallbackEn: 'Tap hear my day.', voiceFallbackNl: 'Tik op lees mijn dag.', offlineCacheTtlSeconds: 300 },
  { screenId: 'PILLS', titleEn: 'My Pills', titleNl: 'Mijn Pillen', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [{ id: 'taken', labelEn: 'I took it', labelNl: 'Ingenomen', accessibilityLabel: 'Confirm medication taken' }], emergencyButton: true, voiceFallbackEn: 'Say taken or later.', voiceFallbackNl: 'Zeg ingenomen of later.', offlineCacheTtlSeconds: 300 },
  { screenId: 'SHIELD', titleEn: 'Shield', titleNl: 'Schild', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Call family first.', voiceFallbackNl: 'Bel eerst familie.', offlineCacheTtlSeconds: 0 },
  { screenId: 'FAMILY', titleEn: 'Family', titleNl: 'Familie', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Send or read a message.', voiceFallbackNl: 'Stuur of lees een bericht.', offlineCacheTtlSeconds: 300 },
  { screenId: 'BUURT', titleEn: 'Neighbourhood', titleNl: 'Uw Buurt', depthFromHome: 2, maxPrimaryItems: 4, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Find a walk buddy.', voiceFallbackNl: 'Zoek een wandelmaatje.', offlineCacheTtlSeconds: 3600 },
  { screenId: 'KOMPAS', titleEn: 'Compass', titleNl: 'Kompas', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Press help if needed.', voiceFallbackNl: 'Druk op hulp als dat nodig is.', offlineCacheTtlSeconds: 300 },
  { screenId: 'STEM', titleEn: 'Voice', titleNl: 'Stem', depthFromHome: 1, maxPrimaryItems: 2, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'I am listening.', voiceFallbackNl: 'Ik luister.', offlineCacheTtlSeconds: 60 },
  { screenId: 'WACHT', titleEn: 'Care', titleNl: 'Zorg', depthFromHome: 2, maxPrimaryItems: 3, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Care notes are ready.', voiceFallbackNl: 'Zorgnotities staan klaar.', offlineCacheTtlSeconds: 300 },
  { screenId: 'SETTINGS', titleEn: 'Settings', titleNl: 'Instellingen', depthFromHome: 1, maxPrimaryItems: 3, bottomActions: [], emergencyButton: true, voiceFallbackEn: 'Ask family for help.', voiceFallbackNl: 'Vraag familie om hulp.', offlineCacheTtlSeconds: 86400 },
];
