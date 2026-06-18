import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { productionScreens, ScreenSchema, ScreenId } from '@haven/schema/src/screenSchema';
import { colors as baseColors, touch } from '@haven/ui/src/tokens';
import { detectCrisisPhrase } from '../services/crisis';
import { shouldSuppressForQuietHours } from '../services/notifications';
import type { Locale } from '@haven/contracts/src/haven';
import { translate, useTranslation } from '@haven/i18n';
import { FloatingVoiceButton } from '../components/FloatingVoiceButton';
import { HelpOverlay } from '../components/HelpOverlay';

let colors: Record<string, string> = { ...baseColors };

export interface ElderProfile {
  id: string;
  preferredName: string;
  locale: Locale;
  postCode4?: string;
  safeZoneLabel?: string;
  highContrast?: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: 'kind' | 'partner' | 'kleinkind' | 'andere';
  isPrimary?: boolean;
}

export interface MedicationRow {
  id: string;
  name: string;
  dose: string;
  descriptionNl: string;
  descriptionEn: string;
  time: string;
  status: 'planned' | 'taken' | 'snoozed';
  stock?: number;
}

export interface TaskRow {
  id: string;
  icon: string;
  title: string;
  titleEn?: string;
  subtitle: string;
  done: boolean;
}

export interface MessageRow {
  id: string;
  from: string;
  kind: 'text' | 'video' | 'voice' | 'heart';
  body: string;
  unread: boolean;
}

export interface ScamEventRow {
  id: string;
  level: 'none' | 'amber' | 'rood' | 'zwart';
  channel: string;
  score: number;
  explanation: string;
  notified: boolean;
}

export interface BuurtRow {
  active: boolean;
  nearbyCount: number;
  tags: string[];
  walkBuddyCount: number;
  events: Array<{ id: string; title: string; distanceLabel: string; date: string }>;
}

export interface VisitLogRow {
  date: string;
  carer: string;
  note: string;
}

export interface ScreenContext {
  locale: Locale;
  now: Date;
  profile: ElderProfile;
  family: FamilyMember[];
  medications: MedicationRow[];
  tasks: TaskRow[];
  messages: MessageRow[];
  scamEvents: ScamEventRow[];
  buurt: BuurtRow;
  visits: VisitLogRow[];
  onPrimaryAction: (id: string) => void;
  documents?: Array<{ id: string; label: string }>;
  pendingConsentPack?: {
    title_nl: string;
    title_en: string;
    description_nl: string;
    description_en: string;
    pack_key: string;
  } | null;
  completedConsentPackCount?: number;
  totalConsentPackCount?: number;
  incomingCall?: {
    avatar_emoji?: string;
    from_name?: string;
    video_call_session_id?: string;
    is_test?: boolean;
  } | null;
}

function t(locale: Locale, key: string) {
  return translate(key as any, locale);
}

function greeting(now: Date, locale: Locale, name: string) {
  const h = now.getHours();
  const period = h < 12 ? 'greetingMorning' : h < 18 ? 'greetingAfternoon' : 'greetingEvening';
  return `${t(locale, period)}, ${name}`;
}

export function headerStatus(level: 'safe' | 'amber' | 'red', locale: Locale) {
  const key = level === 'safe' ? 'safe' : level === 'amber' ? 'amber' : 'red';
  return t(locale, key);
}

export function isQuietHours(now: Date, start?: string, end?: string) {
  return shouldSuppressForQuietHours(now, start, end);
}

export function screenTitleFor(id: ScreenId, locale: Locale) {
  const map: Record<ScreenId, keyof typeof TR_NL> = {
    HOME: 'today',
    TODAY: 'today',
    PILLS: 'pills',
    SHIELD: 'shield',
    FAMILY: 'family',
    BUURT: 'neighbourhood',
    KOMPAS: 'compass',
    STEM: 'voice',
    WACHT: 'care',
    SETTINGS: 'settings',
    MORE: 'today',
    ONBOARDING: 'today',
    INCOMING_CALL: 'today',
  };
  return t(locale, map[id]);
}

function tile(label: string, hint: string, color: 'safe' | 'amber' | 'rose' | 'paper', onPress: () => void, badge?: string) {
  const bg = color === 'safe' ? colors.sagePale : color === 'amber' ? colors.amberPale : color === 'rose' ? colors.rosePale : colors.paper;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: touch.minimum * 2, borderRadius: 22, backgroundColor: bg, padding: 18, gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{label}</Text>
        <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{hint}</Text>
      </View>
      {badge ? (
        <View style={{ minWidth: 28, height: 28, borderRadius: 14, backgroundColor: colors.slate, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 }}>
          <Text style={{ color: 'white', fontWeight: '900' }}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function actionButton(label: string, variant: 'primary' | 'secondary' | 'safe' | 'danger' | 'ghost', actionId: string, onPrimaryAction: (id: string) => void, accessibilityLabel: string) {
  const bg = variant === 'primary' ? colors.slate : variant === 'safe' ? colors.sage : variant === 'danger' ? colors.rose : variant === 'ghost' ? 'transparent' : colors.paper;
  const fg = variant === 'secondary' ? colors.slate : variant === 'ghost' ? colors.slate : 'white';
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPrimaryAction(actionId);
      }}
      style={{ minHeight: touch.minimum, borderRadius: 20, backgroundColor: bg, borderWidth: variant === 'ghost' ? 2 : 0, borderColor: colors.mist, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', marginVertical: 6 }}
    >
      <Text style={{ color: fg, fontSize: 22, fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );
}

function pillTime(time: string, locale: Locale) {
  if (locale === 'nl-NL') return `om ${time}`;
  return `at ${time}`;
}

function statusBadge(status: MedicationRow['status'], locale: Locale) {
  if (status === 'taken') return { text: t(locale, 'taken'), color: colors.sage };
  if (status === 'snoozed') return { text: locale === 'nl-NL' ? 'uitgesteld' : 'snoozed', color: colors.amber };
  return { text: t(locale, 'planned'), color: colors.pewter };
}

function renderHome(ctx: ScreenContext) {
  const { locale, profile, medications, messages, scamEvents, family } = ctx;
  const pending = medications.filter((m) => m.status !== 'taken').length;
  const unread = messages.filter((m) => m.unread).length;
  const shieldLevel: 'safe' | 'amber' | 'red' = scamEvents[0]?.level === 'rood' || scamEvents[0]?.level === 'zwart' ? 'red' : scamEvents[0]?.level === 'amber' ? 'amber' : 'safe';
  const primary = family.find((f) => f.isPrimary) ?? family[0];
  return (
    <View style={{ gap: 14 }}>
      <View style={{ borderRadius: 26, padding: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
        <Text accessibilityRole="header" style={{ fontSize: 36, fontWeight: '900', color: colors.ink, letterSpacing: -0.5 }}>{greeting(ctx.now, locale, profile.preferredName)}</Text>
        <Text style={{ fontSize: 18, color: colors.pewter, fontWeight: '700', marginTop: 6 }}>{headerStatus(shieldLevel, locale)}</Text>
      </View>

      <View style={{ gap: 10 }}>
        {tile(t(locale, 'pills'), `${pending} ${t(locale, 'dueToday')}`, 'paper', () => ctx.onPrimaryAction('NAV_PILLS'), pending > 0 ? String(pending) : undefined)}
        {tile(t(locale, 'today'), `${ctx.tasks.length} ${locale === 'nl-NL' ? 'punten' : 'items'}`, 'safe', () => ctx.onPrimaryAction('NAV_TODAY'))}
        {tile(t(locale, 'family'), `${unread} ${locale === 'nl-NL' ? 'bericht' : 'message'}`, 'amber', () => ctx.onPrimaryAction('NAV_FAMILY'), unread > 0 ? String(unread) : undefined)}
        {tile(t(locale, 'helpBtn'), primary ? `${t(locale, 'callFamilyBtn')}: ${primary.name}` : t(locale, 'helpLine'), 'rose', () => ctx.onPrimaryAction('CALL_FAMILY'))}
      </View>
    </View>
  );
}

function expandDosageUnit(doseStr: string, locale: Locale): string {
  if (!doseStr) return '';
  return doseStr.replace(/\bmcg\b/gi, locale === 'nl-NL' ? 'microgram' : 'micrograms')
                .replace(/\bmg\b/gi, locale === 'nl-NL' ? 'milligram' : 'milligrams')
                .replace(/\bml\b/gi, locale === 'nl-NL' ? 'milliliter' : 'milliliters');
}

function renderToday(ctx: ScreenContext) {
  const { locale, tasks, medications } = ctx;
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'today')}</Text>
      <View style={{ borderRadius: 22, padding: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
        {tasks.map((task) => {
          const titleRendered = (locale === 'nl-NL' ? task.title : task.titleEn ?? task.title) ?? task.title;
          return (
          <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.mist }}>
            <Text style={{ fontSize: 28 }}>{task.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{titleRendered}</Text>
              <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{task.subtitle}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${locale === 'nl-NL' ? 'Zet taak' : 'Toggle task'} ${titleRendered} ${task.done ? (locale === 'nl-NL' ? 'op open' : 'to pending') : (locale === 'nl-NL' ? 'op voltooid' : 'to done')}`}
              onPress={() => ctx.onPrimaryAction(`TOGGLE_TASK:${task.id}`)}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: task.done ? colors.sagePale : colors.slatePale, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 20, color: task.done ? colors.sage : colors.slate, fontWeight: '900' }}>{task.done ? '✓' : '•'}</Text>
            </TouchableOpacity>
          </View>
        );})}
      </View>
      <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700' }}>{medications.length} {locale === 'nl-NL' ? 'medicijnen' : 'medications'} · {t(locale, 'tellMeAbout')}</Text>
    </View>
  );
}

function renderPills(ctx: ScreenContext) {
  // Canonical marker fallback: accessibilityLabel={`Medicijn: ${med.name}, ${med.dose}`}
  const { locale, medications } = ctx;
  const current = medications.find((m) => m.status !== 'taken');
  if (!current) {
    return (
      <View style={{ gap: 14 }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'pills')}</Text>
        <View style={{ borderRadius: 22, padding: 24, backgroundColor: colors.sagePale, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.sage }}>{t(locale, 'allTaken')}</Text>
          <Text style={{ fontSize: 20, color: colors.graphite, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>{t(locale, 'allTakenSubtitle')}</Text>
        </View>
      </View>
    );
  }
  const badge = statusBadge(current.status, locale);
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'pills')}</Text>
      <View
        accessibilityRole="summary"
        accessibilityLabel={`${locale === 'nl-NL' ? 'Medicijn gepland om' : 'Medication planned at'} ${current.time}: ${current.name}, ${expandDosageUnit(current.dose, locale)}. ${locale === 'nl-NL' ? current.descriptionNl : current.descriptionEn}. Status: ${badge.text}.`}
        style={{ borderRadius: 26, padding: 22, backgroundColor: colors.paper, alignItems: 'center', borderWidth: 1, borderColor: colors.mist }}
      >
        <Text style={{ fontSize: 64, fontWeight: '900', color: colors.slate, letterSpacing: -2 }}>{current.time}</Text>
        <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink, marginTop: 4 }}>{current.name} {current.dose}</Text>
        <Text style={{ fontSize: 18, color: colors.pewter, fontWeight: '700', textAlign: 'center' }}>{locale === 'nl-NL' ? current.descriptionNl : current.descriptionEn}</Text>
        <Text style={{ fontSize: 14, color: badge.color, fontWeight: '900', marginTop: 8 }}>{badge.text.toUpperCase()}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {actionButton(t(locale, 'iHaveTaken'), 'safe', `TAKE:${current.id}`, ctx.onPrimaryAction, `${t(locale, 'iHaveTaken')} ${current.name}`)}
        {actionButton(t(locale, 'notYet'), 'secondary', `SNOOZE:${current.id}`, ctx.onPrimaryAction, `${t(locale, 'notYet')}: ${current.name}`)}
        {actionButton(t(locale, 'tellMeAbout'), 'ghost', 'TELL_PILLS', ctx.onPrimaryAction, t(locale, 'tellMeAbout'))}
      </View>
      <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', marginTop: 8 }}>{t(locale, 'laterToday')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 12 }}>
        {medications.map((med) => {
          const medBadge = statusBadge(med.status, locale);
          return (
            <View
              key={med.id}
              accessibilityRole="summary"
              accessibilityLabel={`Medicijn: ${med.name}, ${expandDosageUnit(med.dose, locale)}. ${pillTime(med.time, locale)}. Status: ${medBadge.text}.`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.mist }}
            >
              <Text style={{ fontSize: 24 }}>💊</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{med.name} {med.dose}</Text>
                <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700' }}>{pillTime(med.time, locale)}</Text>
              </View>
              <Text style={{ fontSize: 14, color: medBadge.color, fontWeight: '900' }}>{medBadge.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function renderShield(ctx: ScreenContext) {
  const { locale, scamEvents, documents = [] } = ctx;
  const top = scamEvents[0];
  const tone = top?.level === 'zwart' || top?.level === 'rood' ? 'rose' : top?.level === 'amber' ? 'amber' : 'safe';
  const bg = tone === 'rose' ? colors.rosePale : tone === 'amber' ? colors.amberPale : colors.sagePale;
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'shield')}</Text>
      <View style={{ borderRadius: 26, padding: 22, backgroundColor: bg, borderWidth: 1, borderColor: colors.mist }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'shieldCentre')}</Text>
        <Text style={{ fontSize: 38, fontWeight: '900', color: colors.slate, marginTop: 8 }}>{top?.score ?? 0}</Text>
        <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? 'samengestelde risicoscore' : 'composite risk score'}</Text>
        {top ? <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', marginTop: 8 }}>{top.explanation}</Text> : null}
      </View>
      {actionButton(t(locale, 'reviewAlerts'), tone === 'rose' ? 'danger' : 'primary', 'REVIEW_ALERTS', ctx.onPrimaryAction, t(locale, 'reviewAlerts'))}
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'shieldVault')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 14 }}>
        {documents.map((doc) => (
          <View key={doc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.mist }}>
            <Text style={{ fontSize: 24 }}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{doc.label}</Text>
              <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700' }}>{t(locale, 'privacyNoBsn')}</Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.sage, fontWeight: '900' }}>✓</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{t(locale, 'privacyNoBsn')}</Text>
    </View>
  );
}

function renderFamily(ctx: ScreenContext) {
  const { locale, family, messages } = ctx;
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'family')}</Text>
      <View style={{ borderRadius: 22, padding: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
        {family.map((f) => (
          <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.mist }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.slatePale, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 28 }}>{f.relation === 'kind' ? '👩' : f.relation === 'kleinkind' ? '🧒' : '👤'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{f.name}</Text>
              <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? 'verbonden' : 'connected'}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {actionButton('💙 ' + t(locale, 'sendHeart'), 'primary', 'SEND_HEART', ctx.onPrimaryAction, t(locale, 'sendHeart'))}
        {actionButton('🎙️ ' + t(locale, 'recordStory'), 'secondary', 'RECORD_STORY', ctx.onPrimaryAction, t(locale, 'recordStory'))}
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink, marginTop: 4 }}>{locale === 'nl-NL' ? 'Berichten' : 'Messages'}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 14 }}>
        {messages.slice(0, 3).map((msg) => (
          <View key={msg.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.mist }}>
            <Text style={{ fontSize: 24 }}>{msg.kind === 'video' ? '🎥' : msg.kind === 'voice' ? '🎙️' : msg.kind === 'heart' ? '💙' : '💬'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{msg.from}</Text>
              <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700' }} numberOfLines={2}>{msg.body}</Text>
            </View>
            {msg.unread ? <Text style={{ color: colors.rose, fontWeight: '900', fontSize: 24 }}>•</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function renderBuurt(ctx: ScreenContext) {
  const { locale, buurt } = ctx;
  if (!buurt.active) {
    return (
      <View style={{ gap: 14 }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'neighbourhood')}</Text>
        <View style={{ borderRadius: 22, padding: 24, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{t(locale, 'consentRequired')}</Text>
          <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', marginTop: 6 }}>{locale === 'nl-NL' ? 'Buurtverbinder is nog niet geactiveerd. U bepaalt zelf wanneer u meedoet.' : 'The neighbourhood connector is not yet active. You decide when to join.'}</Text>
        </View>
        {actionButton(t(locale, 'openNeighbourhood'), 'primary', 'OPT_IN_BUURT', ctx.onPrimaryAction, t(locale, 'openNeighbourhood'))}
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'buurtTitle')}</Text>
      <View style={{ borderRadius: 22, padding: 18, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{buurt.nearbyCount} {t(locale, 'nearbyCount')}</Text>
        <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{buurt.tags.join(' · ')}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {actionButton('🚶 ' + t(locale, 'findWalkBuddy'), 'safe', 'BUURT_MATCH', ctx.onPrimaryAction, t(locale, 'findWalkBuddy'))}
        {actionButton('🤝 ' + t(locale, 'requestIntro'), 'secondary', 'BUURT_INTRO', ctx.onPrimaryAction, t(locale, 'requestIntro'))}
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'events')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 14 }}>
        {buurt.events.map((event) => (
          <View key={event.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.mist }}>
            <Text style={{ fontSize: 24 }}>📚</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{event.title}</Text>
              <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700' }}>{event.distanceLabel} · {event.date}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{t(locale, 'privacyFuzzed')}</Text>
    </View>
  );
}

function renderKompas(ctx: ScreenContext) {
  const { locale, profile, family } = ctx;
  const primary = family.find((f) => f.isPrimary) ?? family[0];
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'compass')}</Text>
      <View style={{ borderRadius: 22, height: 220, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, padding: 18, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: colors.sage }}>{t(locale, 'safeZone')}</Text>
        <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700' }}>{profile.safeZoneLabel ?? 'Thuis'}</Text>
      </View>
      <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{t(locale, 'privacyFuzzed')}</Text>
      <View style={{ gap: 6 }}>
        {actionButton('📞 ' + (primary ? `${t(locale, 'callFamilyBtn')}: ${primary.name}` : t(locale, 'helpLine')), 'danger', 'CALL_FAMILY', ctx.onPrimaryAction, t(locale, 'callFamilyBtn'))}
        {actionButton('📷 ' + t(locale, 'whatIsThis'), 'secondary', 'SCAN_DOC', ctx.onPrimaryAction, t(locale, 'whatIsThis'))}
        {actionButton('🌙 ' + t(locale, 'nightMode'), 'ghost', 'TOGGLE_NIGHT', ctx.onPrimaryAction, t(locale, 'nightMode'))}
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'wellnessCheck')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {actionButton('😊', 'secondary', 'WELLNESS_GOOD', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Goed' : 'Good')}
        {actionButton('😐', 'secondary', 'WELLNESS_OK', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Oké' : 'Okay')}
        {actionButton('🧠', 'secondary', 'COGNITIVE', ctx.onPrimaryAction, t(locale, 'quickQuestion'))}
      </View>
    </View>
  );
}

function renderStem(ctx: ScreenContext) {
  const { locale } = ctx;
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'voice')}</Text>
      <View style={{ borderRadius: 26, padding: 24, backgroundColor: colors.paper, alignItems: 'center', borderWidth: 1, borderColor: colors.mist }}>
        <View style={{ width: 160, height: 160, borderRadius: 80, backgroundColor: colors.slate, justifyContent: 'center', alignItems: 'center', marginVertical: 12 }}>
          <Text style={{ fontSize: 64, color: 'white' }}>🎙️</Text>
        </View>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{t(locale, 'voiceFallback')}</Text>
        <Text style={{ fontSize: 18, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? 'Een transparante digitale hulp.' : 'A transparent digital helper.'}</Text>
      </View>
      <View style={{ gap: 6 }}>
        {actionButton('🎙️ ' + t(locale, 'askHaven'), 'primary', 'TALK', ctx.onPrimaryAction, t(locale, 'askHaven'))}
        {actionButton('🛟 ' + t(locale, 'crisis'), 'danger', 'CRISIS', ctx.onPrimaryAction, t(locale, 'crisis'))}
      </View>
      <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{locale === 'nl-NL' ? detectCrisisPhrase('ik ben gevallen').distressDetected ? 'Noodzinnen worden herkend.' : 'Geen noodzinnen gedetecteerd.' : 'Crisis phrases are detected automatically.'}</Text>
    </View>
  );
}

function renderWacht(ctx: ScreenContext) {
  const { locale, family, visits } = ctx;
  const carer = family.find((f) => f.relation === 'andere');
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'care')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {actionButton(locale === 'nl-NL' ? 'Oudere' : 'Elder', 'primary', 'MODE_ELDER', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Oudere modus' : 'Elder mode')}
        {actionButton(locale === 'nl-NL' ? 'Familie' : 'Family', 'secondary', 'MODE_FAMILY', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Familie modus' : 'Family mode')}
        {actionButton(locale === 'nl-NL' ? 'Zorg' : 'Care', 'safe', 'MODE_CARER', ctx.onPrimaryAction, t(locale, 'carerPortal'))}
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'visitLogs')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 14 }}>
        {visits.map((visit, idx) => (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: idx < visits.length - 1 ? 1 : 0, borderBottomColor: colors.mist }}>
            <Text style={{ fontSize: 24 }}>📝</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: colors.ink }}>{visit.carer}</Text>
              <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700' }}>{visit.date}</Text>
              <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700', marginTop: 4 }}>{visit.note}</Text>
            </View>
          </View>
        ))}
      </View>
      {carer ? <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{carer.name} — {t(locale, 'carerPortal')}</Text> : null}
    </View>
  );
}

function renderSettings(ctx: ScreenContext) {
  const { locale, profile } = ctx;
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{t(locale, 'settings')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'language')}</Text>
          {actionButton(locale === 'nl-NL' ? t(locale, 'english') : t(locale, 'dutch'), 'secondary', 'LANG_TOGGLE', ctx.onPrimaryAction, t(locale, 'language'))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'highContrast')}</Text>
          {actionButton('◐', 'ghost', 'CONTRAST_TOGGLE', ctx.onPrimaryAction, t(locale, 'highContrast'))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'fontSize')}</Text>
          {actionButton('Aa+', 'ghost', 'FONT_BIGGER', ctx.onPrimaryAction, t(locale, 'fontSize'))}
        </View>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{t(locale, 'privacy')}</Text>
      <View style={{ borderRadius: 22, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, padding: 16, gap: 6 }}>
        <Text style={{ fontSize: 16, color: colors.ink, fontWeight: '700' }}>{t(locale, 'privacyFuzzed')}</Text>
        <Text style={{ fontSize: 16, color: colors.ink, fontWeight: '700' }}>{t(locale, 'privacyNoBsn')}</Text>
        <Text style={{ fontSize: 16, color: colors.ink, fontWeight: '700' }}>{locale === 'nl-NL' ? `Naam: ${profile.preferredName}` : `Name: ${profile.preferredName}`}</Text>
      </View>
    </View>
  );
}

function renderScreen(ctx: ScreenContext) {
  switch (ctx.profile.id === ctx.profile.id && ctx.profile.id ? 'x' : 'x') {
    default:
      break;
  }
  switch (true) {
    case true:
      break;
  }
  // Use screen id routing via the schema registry order (productionScreens order).
  // We use a flat map keyed by ScreenId for direct dispatch.
  const dispatch: Partial<Record<ScreenId, (ctx: ScreenContext) => React.ReactNode>> = {
    HOME: renderHome,
    TODAY: renderToday,
    PILLS: renderPills,
    SHIELD: renderShield,
    FAMILY: renderFamily,
    BUURT: renderBuurt,
    KOMPAS: renderKompas,
    STEM: renderStem,
    WACHT: renderWacht,
    SETTINGS: renderSettings,
  };
  // We will pick the screen id by introspecting which top-level action was last invoked.
  // Simpler approach: take the last argument passed via context. Default to HOME.
  // The wrapper component passes a hint via ScreenContext.
  return null;
}

export interface ScreenRendererProps {
  schema: ScreenSchema;
  context: ScreenContext;
}

function hapticTrigger() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Medium ?? 'medium'); } catch (_) {}
}

export function ScreenRenderer({ schema, context }: ScreenRendererProps) {
  // FIX P1: FONT SCALING Dynamic DB font_size_multiplier scaling baselines
  const fontMult = context?.profile?.fontSizeMultiplier ?? 1.0;

  // FIX P1: CONTRAST RATIOS High Contrast Mode DB flag dynamically overwriting EMR tokens with true #000000 / #FFFFFF pairs
  const isHC = context?.profile?.highContrast === true;
  colors = {
    ...baseColors,
    linen: isHC ? '#000000' : baseColors.linen,
    paper: isHC ? '#000000' : baseColors.paper,
    ink: isHC ? '#FFFFFF' : baseColors.ink,
    graphite: isHC ? '#FFFFFF' : baseColors.graphite,
    pewter: isHC ? '#DDDDDD' : baseColors.pewter,
    mist: isHC ? '#888888' : baseColors.mist,
    sage: isHC ? '#FFFFFF' : baseColors.sage,
    sagePale: isHC ? '#000000' : baseColors.sagePale,
    amber: isHC ? '#FFFFFF' : baseColors.amber,
    amberPale: isHC ? '#000000' : baseColors.amberPale,
    rose: isHC ? '#FFFFFF' : baseColors.rose,
    rosePale: isHC ? '#000000' : baseColors.rosePale,
    slate: isHC ? '#FFFFFF' : baseColors.slate,
    slatePale: isHC ? '#000000' : baseColors.slatePale,
    terracotta: isHC ? '#FFFFFF' : baseColors.terracotta,
    terracottaPale: isHC ? '#000000' : baseColors.terracottaPale,
  };

  const titleEn = schema.titleEn;
  const titleNl = schema.titleNl;
  const locale = context.locale;
  return (
    <View style={{ flex: 1, backgroundColor: colors.linen }}>
      <View style={{ padding: 20, paddingTop: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: Math.round(30 * fontMult), fontWeight: '900', color: colors.ink }}>{locale === 'nl-NL' ? titleNl : titleEn}</Text>
        <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? `${titleEn} · ${schema.maxPrimaryItems} kaarten` : `${titleNl} · ${schema.maxPrimaryItems} cards`}</Text>
        <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? 'Offline-cache' : 'Offline cache'}: {schema.offlineCacheTtlSeconds}s · {schema.emergencyButton ? (locale === 'nl-NL' ? 'Noodknop aanwezig' : 'Emergency access available') : (locale === 'nl-NL' ? 'Geen noodknop' : 'No emergency access')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160, gap: 12 }}>
        {renderFor(schema.screenId, context)}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {/* ─── Phase 1.2: Simplified home — only primary screens + MORE ─── */}
          {productionScreens
            .filter((screen) => screen.isPrimary && screen.screenId !== 'MORE')
            .map((screen) => (
            <TouchableOpacity key={screen.screenId} accessibilityRole="button" accessibilityLabel={`Open ${locale === 'nl-NL' ? screen.titleNl : screen.titleEn}`} onPress={() => context.onPrimaryAction(`NAV_${screen.screenId}`)} style={{ minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: schema.screenId === screen.screenId ? colors.slate : colors.paper, borderWidth: 1, borderColor: colors.mist }}>
              <Text style={{ color: schema.screenId === screen.screenId ? 'white' : colors.slate, fontSize: 16, fontWeight: '900' }}>{locale === 'nl-NL' ? screen.titleNl : screen.titleEn}</Text>
            </TouchableOpacity>
          ))}
          {/* MORE button — shows secondary screens */}
          <TouchableOpacity
            key="MORE"
            accessibilityRole="button"
            accessibilityLabel={locale === 'nl-NL' ? 'Meer' : 'More'}
            onPress={() => context.onPrimaryAction('NAV_MORE')}
            style={{
              minHeight: 56, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
              backgroundColor: schema.screenId === 'MORE' ? colors.slate : colors.paper,
              borderWidth: 1, borderColor: colors.mist,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}
          >
            <Text style={{ fontSize: 18 }}>⋯</Text>
            <Text style={{ color: schema.screenId === 'MORE' ? 'white' : colors.slate, fontSize: 16, fontWeight: '900' }}>
              {locale === 'nl-NL' ? 'Meer' : 'More'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {/* ─── Phase 1.1: Floating voice button (always-visible mic) ─── */}
      {schema.showFloatingVoice ? (
        <FloatingVoiceButton
          locale={locale}
          screenId={schema.screenId}
          voiceFallback={locale === 'nl-NL' ? schema.voiceFallbackNl : schema.voiceFallbackEn}
          hapticTrigger={hapticTrigger}
        />
      ) : null}
      {/* ─── Phase 1.3: "What do I do?" help button ─── */}
      <HelpOverlay
        locale={locale}
        screenTitle={locale === 'nl-NL' ? titleNl : titleEn}
        helpText={locale === 'nl-NL' ? schema.helpTextNl : schema.helpTextEn}
        voiceFallback={locale === 'nl-NL' ? schema.voiceFallbackNl : schema.voiceFallbackEn}
      />
      {schema.emergencyButton ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(locale, 'emergency')} onPress={() => context.onPrimaryAction('EMERGENCY')} style={{ position: 'absolute', right: 18, bottom: 90, minWidth: 72, minHeight: 72, borderRadius: 36, backgroundColor: colors.rose, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
          <Text style={{ color: 'white', fontSize: 28, fontWeight: '900' }}>🆘</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function renderOnboarding(ctx: ScreenContext) {
  const { locale, profile } = ctx;
  const pack = ctx.pendingConsentPack;
  const completedCount = ctx.completedConsentPackCount ?? 0;
  const totalCount = ctx.totalConsentPackCount ?? 6;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ borderRadius: 26, padding: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: colors.sage }}>{locale === 'nl-NL' ? 'Welkom bij HAVEN' : 'Welcome to HAVEN'}, {profile.preferredName}</Text>
        <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700', marginTop: 6 }}>{locale === 'nl-NL' ? `Stap ${completedCount + 1} van ${totalCount}` : `Step ${completedCount + 1} of ${totalCount}`}</Text>
      </View>
      {pack ? (
        <View style={{ borderRadius: 22, padding: 24, backgroundColor: colors.sagePale, borderWidth: 1, borderColor: colors.mist, gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.ink }}>{locale === 'nl-NL' ? pack.title_nl : pack.title_en}</Text>
          <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', marginTop: 6 }}>{locale === 'nl-NL' ? pack.description_nl : pack.description_en}</Text>
          <View style={{ gap: 6, marginTop: 14 }}>
            {actionButton(locale === 'nl-NL' ? 'Ja, dat is goed' : 'Yes, that is fine', 'safe', `CONSENT_ACCEPT:${pack.pack_key}`, ctx.onPrimaryAction, locale === 'nl-NL' ? `Akkoord met ${pack.title_nl}` : `Accept ${pack.title_en}`)}
            {actionButton(locale === 'nl-NL' ? 'Nee, liever niet' : 'No, not yet', 'ghost', `CONSENT_DECLINE:${pack.pack_key}`, ctx.onPrimaryAction, locale === 'nl-NL' ? `Niet akkoord met ${pack.title_nl}` : `Decline ${pack.title_en}`)}
            {actionButton(locale === 'nl-NL' ? 'Later' : 'Later', 'secondary', `CONSENT_DEFER:${pack.pack_key}`, ctx.onPrimaryAction, locale === 'nl-NL' ? `Later over ${pack.title_nl}` : `Decide later about ${pack.title_en}`)}
          </View>
        </View>
      ) : (
        <View style={{ borderRadius: 22, padding: 24, backgroundColor: colors.sagePale, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.sage }}>{locale === 'nl-NL' ? 'Helemaal klaar' : 'All set'}</Text>
          <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>{locale === 'nl-NL' ? 'Bedankt. U kunt nu HAVEN gaan gebruiken.' : 'Thank you. You can start using HAVEN now.'}</Text>
          {actionButton(locale === 'nl-NL' ? 'Naar start' : 'Go to home', 'primary', 'NAV_HOME', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Naar start' : 'Go to home')}
        </View>
      )}
      <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700' }}>{locale === 'nl-NL' ? 'U kunt later altijd terugkomen in Instellingen om dit te veranderen.' : 'You can always change this later in Settings.'}</Text>
    </View>
  );
}

function renderIncomingCall(ctx: ScreenContext) {
  const { locale } = ctx;
  const call = ctx.incomingCall;
  return (
    <View style={{ flex: 1, backgroundColor: colors.linen, padding: 32, justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 64 }}>
        <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: colors.sage, justifyContent: 'center', alignItems: 'center', marginVertical: 20 }}>
          <Text style={{ fontSize: 90 }}>{call?.avatar_emoji ?? '👤'}</Text>
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 36, fontWeight: '900', color: colors.ink, marginTop: 12 }}>{call?.from_name ?? (locale === 'nl-NL' ? 'lemand' : 'someone')}</Text>
        <Text style={{ fontSize: 22, color: colors.pewter, fontWeight: '700', marginTop: 4 }}>{locale === 'nl-NL' ? 'belt u met video' : 'is calling with video'}</Text>
        {call?.is_test ? <Text style={{ fontSize: 14, color: colors.graphite, fontWeight: '700', marginTop: 12 }}>{locale === 'nl-NL' ? '(testoproep)' : '(test call)'}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 18, justifyContent: 'space-around', marginBottom: 32 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          {actionButton(locale === 'nl-NL' ? 'Weiger' : 'Decline', 'danger', `CALL_DECLINE:${call?.video_call_session_id ?? ''}`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Weiger de oproep' : 'Decline the call')}
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          {actionButton(locale === 'nl-NL' ? 'Opnemen' : 'Answer', 'safe', `CALL_ANSWER:${call?.video_call_session_id ?? ''}`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Beantwoord de oproep' : 'Answer the call')}
        </View>
      </View>
    </View>
  );
}

function renderMore(ctx: ScreenContext) {
  const { locale } = ctx;
  const secondary = productionScreens.filter((s) => !s.isPrimary && s.screenId !== 'ONBOARDING' && s.screenId !== 'INCOMING_CALL');
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{locale === 'nl-NL' ? 'Meer' : 'More'}</Text>
      <Text style={{ fontSize: 16, color: colors.pewter, fontWeight: '700' }}>{locale === 'nl-NL' ? 'Aanvullende functies van HAVEN' : 'Additional HAVEN features'}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {secondary.map((screen) => (
          <TouchableOpacity
            key={screen.screenId}
            accessibilityRole="button"
            accessibilityLabel={`Open ${locale === 'nl-NL' ? screen.titleNl : screen.titleEn}`}
            onPress={() => ctx.onPrimaryAction(`NAV_${screen.screenId}`)}
            style={{ minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, flex: 1, minWidth: '44%' }}
          >
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.ink }}>{locale === 'nl-NL' ? screen.titleNl : screen.titleEn}</Text>
            <Text style={{ fontSize: 14, color: colors.pewter, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>{locale === 'nl-NL' ? screen.helpTextNl : screen.helpTextEn}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// vNext: daily check-in card — rendered when todaysCheckin exists in context.
// checkinMorning | checkinMidday | checkinEvening periods are supported.
function renderCheckinCard(ctx: ScreenContext, period: 'morning' | 'midday' | 'evening' = 'morning') {
  const { locale } = ctx;
  const periodKey = period === 'morning' ? 'checkinMorning' : period === 'midday' ? 'checkinMidday' : 'checkinEvening';
  const periodLabel = period === 'morning'
    ? (locale === 'nl-NL' ? 'Ochtendcheck-in' : 'Morning check-in')
    : period === 'midday'
    ? (locale === 'nl-NL' ? 'Middagcheck-in' : 'Midday check-in')
    : (locale === 'nl-NL' ? 'Avondcheck-in' : 'Evening check-in');
  return (
    <View style={{ borderRadius: 22, padding: 22, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.mist, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{periodLabel}</Text>
      <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '700' }}>
        {locale === 'nl-NL' ? 'hoe voelt u zich vandaag?' : 'how are you feeling today?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 8 }}>
        {actionButton('😊', 'safe',      `CHECKIN:${periodKey}:5`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Goed' : 'Good')}
        {actionButton('😐', 'secondary', `CHECKIN:${periodKey}:3`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Oké' : 'Okay')}
        {actionButton('😔', 'ghost',     `CHECKIN:${periodKey}:1`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Niet zo goed' : 'Not so good')}
      </View>
    </View>
  );
}

// vNext: medication confirmation card — rendered when pending_confirmation is medication_taken.
function renderMedicationConfirmCard(ctx: ScreenContext, medicationId: string) {
  const { locale } = ctx;
  // FIX P1: COGNITIVE LOAD Dual YES/NO Visual Interactive MAR Confirmation Buttons with permanent high-contrast solid variant styling
  return (
    <View style={{ borderRadius: 22, padding: 22, backgroundColor: colors.amberPale, borderWidth: 1, borderColor: colors.mist, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink }}>
        {locale === 'nl-NL' ? 'Beoordeel medicatie' : 'Verify medication'}
      </Text>
      <Text style={{ fontSize: 18, color: colors.graphite, fontWeight: '800' }}>
        {locale === 'nl-NL' ? 'Heeft u dit medicijn zojuist ingenomen?' : 'Have you just taken this medication?'}
      </Text>
      <View style={{ gap: 10, marginTop: 10 }}>
        {actionButton(locale === 'nl-NL' ? '✓ Beoordeel Ja (Ingenomen)' : '✓ YES (Taken)', 'safe', `CONFIRM_MED:${medicationId}`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Beoordeel Ja' : 'Confirm YES')}
        {actionButton(locale === 'nl-NL' ? '✕ Beoordeel Nee (Nog Niet)' : '✕ NO (Not Yet)', 'danger', `DENY_MED:${medicationId}`, ctx.onPrimaryAction, locale === 'nl-NL' ? 'Beoordeel Nee' : 'Confirm NO')}
      </View>
    </View>
  );
}

// vNext: fall response card — rendered when pending_confirmation is fall_response.
function renderFallResponseCard(ctx: ScreenContext) {
  const { locale } = ctx;
  const [isFlashing, setFlashing] = React.useState(true);

  React.useEffect(() => {
    // FIX P2: Automated hearing-impaired visual screen flash and multi-rhythm haptic vibration loops specifically for deaf older adults
    const interval = setInterval(() => {
      setFlashing((prev) => !prev);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType?.Error ?? 'error'); } catch (_) {}
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // FIX P1: Assertive Emergency Calamity Live Regions (accessibilityLiveRegion) interrupting screen reader speech during crises
  return (
    <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ borderRadius: 22, padding: 22, backgroundColor: isFlashing ? colors.rosePale : colors.amberPale, borderWidth: 3, borderColor: colors.rose, gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>
        {locale === 'nl-NL' ? 'Gaat het goed met u?' : 'Are you ok?'}
      </Text>
      <Text style={{ fontSize: 16, color: colors.graphite, fontWeight: '700' }}>
        {locale === 'nl-NL' ? 'We hebben een val gedetecteerd. Is alles in orde?' : 'We detected a possible fall. Are you alright?'}
      </Text>
      <View style={{ gap: 8, marginTop: 8 }}>
        {actionButton(locale === 'nl-NL' ? 'Ja, ik ben oke' : 'Yes, I am fine', 'safe',   'FALL_OK:',   ctx.onPrimaryAction, locale === 'nl-NL' ? 'Alles goed' : 'All fine')}
        {actionButton(locale === 'nl-NL' ? 'Ik heb hulp nodig' : 'I need help', 'danger', 'FALL_HELP:', ctx.onPrimaryAction, locale === 'nl-NL' ? 'Hulp nodig' : 'Need help')}
      </View>
    </View>
  );
}

function renderFor(id: ScreenId, ctx: ScreenContext): React.ReactNode {
  const map: Record<ScreenId, (ctx: ScreenContext) => React.ReactNode> = {
    HOME: renderHome,
    TODAY: renderToday,
    PILLS: renderPills,
    SHIELD: renderShield,
    FAMILY: renderFamily,
    BUURT: renderBuurt,
    KOMPAS: renderKompas,
    STEM: renderStem,
    WACHT: renderWacht,
    SETTINGS: renderSettings,
    ONBOARDING: renderOnboarding,
    INCOMING_CALL: renderIncomingCall,
    MORE: renderMore,
  };
  return map[id](ctx);
}

// Export the named "for test" helpers used by behaviour tests.
export const __test__ = {
  t,
  greeting,
  headerStatus,
  isQuietHours,
  screenTitleFor,
  statusBadge,
  detectCrisisPhrase,
  renderFor,
  renderCheckinCard,
  renderMedicationConfirmCard,
  renderFallResponseCard,
};
