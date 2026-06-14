// ─── Phase 1: 5-card home, floating voice, help text ───
export type ScreenId = 'HOME' | 'TODAY' | 'PILLS' | 'SHIELD' | 'FAMILY' | 'BUURT' | 'KOMPAS' | 'STEM' | 'WACHT' | 'SETTINGS' | 'ONBOARDING' | 'INCOMING_CALL' | 'MORE';

export interface ScreenSchema {
  screenId: ScreenId;
  titleEn: string;
  titleNl: string;
  depthFromHome: 0 | 1 | 2;
  maxPrimaryItems: number;
  isPrimary: boolean;            // Phase 1: shown on the 5-card home bar
  showFloatingVoice: boolean;    // Phase 1: persistent floating mic button
  bottomActions: Array<{ id: string; labelEn: string; labelNl: string; accessibilityLabel: string }>;
  emergencyButton: boolean;
  voiceFallbackEn: string;
  voiceFallbackNl: string;
  helpTextNl: string;           // Phase 1: one-sentence "what do I do?" help
  helpTextEn: string;
  offlineCacheTtlSeconds: number;
}

export const productionScreens: ScreenSchema[] = [
  {
    screenId: 'HOME', titleEn: 'HAVEN', titleNl: 'HAVEN',
    depthFromHome: 0, maxPrimaryItems: 5, isPrimary: true, showFloatingVoice: true,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'How can I help?', voiceFallbackNl: 'Waarmee kan ik helpen?',
    helpTextNl: 'Dit is uw startpagina. Tik op een kaart om uw pillen, familie of schild te openen. De microfoon linksonder luistert altijd.',
    helpTextEn: 'This is your home screen. Tap a card to open your pills, family or shield. The microphone at the bottom left is always listening.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'TODAY', titleEn: 'Today', titleNl: 'Vandaag',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: true, showFloatingVoice: true,
    bottomActions: [{ id: 'hear', labelEn: 'Hear my day', labelNl: 'Lees mijn dag', accessibilityLabel: 'Hear the daily brief' }],
    emergencyButton: true,
    voiceFallbackEn: 'Tap hear my day.', voiceFallbackNl: 'Tik op lees mijn dag.',
    helpTextNl: 'Hier ziet u uw taken en afspraken voor vandaag. Tik op een taak als u deze heeft gedaan.',
    helpTextEn: 'Here you can see your tasks and appointments for today. Tap a task when you have completed it.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'PILLS', titleEn: 'My Pills', titleNl: 'Mijn Pillen',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: true, showFloatingVoice: true,
    bottomActions: [{ id: 'taken', labelEn: 'I took it', labelNl: 'Ingenomen', accessibilityLabel: 'Confirm medication taken' }],
    emergencyButton: true,
    voiceFallbackEn: 'Say taken or later.', voiceFallbackNl: 'Zeg ingenomen of later.',
    helpTextNl: 'Hier ziet u uw medicijnen voor vandaag. Tik op Ingenomen als u een pil heeft genomen. U kunt ook tegen de microfoon zeggen: ik heb mijn pillen ingenomen.',
    helpTextEn: 'Here you can see your medications for today. Tap Taken after taking a pill. You can also say "I took my pills" to the microphone.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'SHIELD', titleEn: 'Shield', titleNl: 'Schild',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: true, showFloatingVoice: true,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Call family first.', voiceFallbackNl: 'Bel eerst familie.',
    helpTextNl: 'Dit is uw Schild. Als u een verdacht telefoontje of bericht krijgt, tik op Is dit echt? HAVEN helpt u rustig verder.',
    helpTextEn: 'This is your Shield. If you get a suspicious call or message, tap Is this real? HAVEN will help you calmly.',
    offlineCacheTtlSeconds: 0,
  },
  {
    screenId: 'FAMILY', titleEn: 'Family', titleNl: 'Familie',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: true, showFloatingVoice: true,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Send or read a message.', voiceFallbackNl: 'Stuur of lees een bericht.',
    helpTextNl: 'Hier ziet u berichten van uw familie. Tik op Stuur een hart om te laten weten dat alles goed gaat.',
    helpTextEn: 'Here you can see messages from your family. Tap Send a heart to let them know everything is fine.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'BUURT', titleEn: 'Neighbourhood', titleNl: 'Uw Buurt',
    depthFromHome: 2, maxPrimaryItems: 4, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Find a walk buddy.', voiceFallbackNl: 'Zoek een wandelmaatje.',
    helpTextNl: 'Hier vindt u mensen in uw buurt met dezelfde interesses. Uw naam blijft privé tot u ja zegt.',
    helpTextEn: 'Here you can find people in your neighbourhood with shared interests. Your name stays private until you say yes.',
    offlineCacheTtlSeconds: 3600,
  },
  {
    screenId: 'KOMPAS', titleEn: 'Compass', titleNl: 'Kompas',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Press help if needed.', voiceFallbackNl: 'Druk op hulp als dat nodig is.',
    helpTextNl: 'Kompas helpt u met veilige zones, nachtmodus en uw noodprofiel. Uw locatie wordt nooit precies gedeeld.',
    helpTextEn: 'Compass helps with safe zones, night mode and your emergency profile. Your location is never shared precisely.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'STEM', titleEn: 'Voice', titleNl: 'Stem',
    depthFromHome: 1, maxPrimaryItems: 2, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'I am listening.', voiceFallbackNl: 'Ik luister.',
    helpTextNl: 'Praat met HAVEN. U kunt vragen stellen, herinneringen ophalen of gewoon een praatje maken.',
    helpTextEn: 'Talk to HAVEN. You can ask questions, recall memories or just chat.',
    offlineCacheTtlSeconds: 60,
  },
  {
    screenId: 'WACHT', titleEn: 'Care', titleNl: 'Zorg',
    depthFromHome: 2, maxPrimaryItems: 3, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Care notes are ready.', voiceFallbackNl: 'Zorgnotities staan klaar.',
    helpTextNl: 'Hier ziet u zorgnotities van uw zorgverleners. U kunt zien wanneer zij langs zijn geweest en wat zij hebben genoteerd.',
    helpTextEn: 'Here you can see care notes from your care workers. You can see when they visited and what they noted.',
    offlineCacheTtlSeconds: 300,
  },
  {
    screenId: 'SETTINGS', titleEn: 'Settings', titleNl: 'Instellingen',
    depthFromHome: 1, maxPrimaryItems: 3, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Ask family for help.', voiceFallbackNl: 'Vraag familie om hulp.',
    helpTextNl: 'Hier past u HAVEN aan. U kunt de tekst groter maken, hoog contrast aanzetten of de taal wijzigen.',
    helpTextEn: 'Here you can adjust HAVEN. You can make text larger, enable high contrast or change the language.',
    offlineCacheTtlSeconds: 86400,
  },
  {
    screenId: 'ONBOARDING', titleEn: 'Welcome', titleNl: 'Welkom',
    depthFromHome: 0, maxPrimaryItems: 1, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Welcome to HAVEN.', voiceFallbackNl: 'Welkom bij HAVEN.',
    helpTextNl: 'Welkom! We lopen samen door een paar instellingen zodat HAVEN u goed kan helpen.',
    helpTextEn: 'Welcome! Let us walk through a few settings so HAVEN can help you properly.',
    offlineCacheTtlSeconds: 3600,
  },
  {
    screenId: 'INCOMING_CALL', titleEn: 'Incoming call', titleNl: 'Inkomende oproep',
    depthFromHome: 0, maxPrimaryItems: 1, isPrimary: false, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'Someone is calling.', voiceFallbackNl: 'Er belt iemand.',
    helpTextNl: 'Iemand belt u met video. Tik op Opnemen om te antwoorden of Weiger als u niet wilt opnemen.',
    helpTextEn: 'Someone is calling with video. Tap Answer to pick up or Decline if you do not want to answer.',
    offlineCacheTtlSeconds: 0,
  },
  {
    screenId: 'MORE', titleEn: 'More', titleNl: 'Meer',
    depthFromHome: 1, maxPrimaryItems: 6, isPrimary: true, showFloatingVoice: false,
    bottomActions: [], emergencyButton: true,
    voiceFallbackEn: 'More options.', voiceFallbackNl: 'Meer mogelijkheden.',
    helpTextNl: 'Hier vindt u aanvullende functies zoals Buurt, Kompas, Stem, Zorg en Instellingen.',
    helpTextEn: 'Here you find additional features like Neighbourhood, Compass, Voice, Care and Settings.',
    offlineCacheTtlSeconds: 3600,
  },
];
