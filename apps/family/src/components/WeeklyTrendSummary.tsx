import React from 'react';

interface WeeklyTrendSummaryProps {
  weekStart: string;
  summary: {
    medicationAdherence: number;
    scamEvents: number;
    wellnessAvg: number;
    familyInteractions: number;
    quietDays: number;
  };
}

export function WeeklyTrendSummary({ weekStart, summary }: WeeklyTrendSummaryProps) {
  const generateSummaryText = () => {
    const parts: string[] = [];

    if (summary.medicationAdherence >= 90) {
      parts.push(`Uw naaste heeft deze week ${summary.medicationAdherence}% van de medicijnen ingenomen.`);
    } else {
      parts.push(`Er waren deze week enkele gemiste medicijnen (${100 - summary.medicationAdherence}% niet ingenomen).`);
    }

    if (summary.scamEvents === 0) {
      parts.push('Er zijn geen verdachte oproepen of berichten gemeld.');
    } else {
      parts.push(`${summary.scamEvents} verdachte gebeurtenis(sen) zijn opgemerkt.`);
    }

    if (summary.quietDays > 1) {
      parts.push('Er waren meerdere rustige dagen.');
    }

    if (summary.familyInteractions >= 5) {
      parts.push('Het contact met de familie was goed.');
    }

    return parts.join(' ') || 'Deze week was rustig.';
  };

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 22,
      padding: 24,
      boxShadow: '0 14px 40px rgba(44,62,107,.12)',
      border: '1px solid #E8EBF2',
      marginBottom: 24
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>Weekoverzicht</h3>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: '#3A3F52' }}>
        {generateSummaryText()}
      </p>
      <div style={{ fontSize: 12, color: '#8A90A8', marginTop: 12 }}>
        Week van {new Date(weekStart).toLocaleDateString('nl-NL')}
      </div>
    </div>
  );
}