export interface LocalMedicationNotification {
  reminderId: string;
  medicationName: string;
  scheduledAt: string;
  locale: 'en-GB' | 'nl-NL';
}

export function medicationNotificationCopy(input: LocalMedicationNotification) {
  if (input.locale === 'nl-NL') {
    return {
      title: 'Medicijntijd 💊',
      body: `Het is tijd voor ${input.medicationName}. Zeg gerust “straks” als u later wilt.`,
      data: { reminder_id: input.reminderId, screen: 'PILLS' },
    };
  }
  return {
    title: 'Medicine time 💊',
    body: `It is time for ${input.medicationName}. You can say “later” if you need a moment.`,
    data: { reminder_id: input.reminderId, screen: 'PILLS' },
  };
}

export function shouldSuppressForQuietHours(now: Date, start?: string, end?: string) {
  if (!start || !end) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? minutes >= s && minutes <= e : minutes >= s || minutes <= e;
}
