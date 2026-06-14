import React from 'react';
import Link from 'next/link';
import { DashboardCard } from '../../../components/DashboardCard';

export default function FamiliarVoicePage() {
  return (
    <main style={{ padding: 32, background: '#F5F3EE', minHeight: '100vh', fontFamily: 'Nunito, system-ui, sans-serif', color: '#1A1F2E' }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 30 }}>Vertrouwde stem</h1>
        <p style={{ color: '#6B7490', fontWeight: 700, marginTop: 6 }}>Optioneel. Met uw eigen stem klinkt HAVEN vertrouwder voor uw naaste. U bepaalt zelf of u dit wilt.</p>
      </header>
      <DashboardCard title="Hoe het werkt" subtitle="Stap voor stap">
        <ol style={{ paddingLeft: 18, margin: 0, fontWeight: 700, color: '#1A1F2E' }}>
          <li>U neemt 5–10 minuten stem op via de microfoon van uw telefoon. Lees de aangegeven zinnen voor, in uw eigen tempo.</li>
          <li>Wij uploaden de opname naar een beveiligde provider. Uw stem wordt opgeslagen als een "voice profile" dat alleen met uw toestemming wordt gebruikt.</li>
          <li>Uw naaste krijgt in HAVEN een schakelaar: "Gebruik de stem van Sarah". Bij crisis schakelt HAVEN automatisch terug naar een neutrale stem.</li>
          <li>U kunt op elk moment uw opname intrekken. Wij verwijderen het voice profile direct.</li>
        </ol>
      </DashboardCard>
      <DashboardCard title="Privacy" subtitle="Wat we wel en niet doen">
        <ul style={{ paddingLeft: 18, margin: 0, fontWeight: 700, color: '#1A1F2E' }}>
          <li>Wij slaan uw stem op in een versleutelde provider-opslag (EU).</li>
          <li>Wij gebruiken de stem uitsluitend voor gesproken reacties van HAVEN aan uw naaste.</li>
          <li>Wij sturen uw stem niet door aan derden voor marketing, onderzoek, of iets anders.</li>
          <li>Wij bewaren de opname tot u hem intrekt of tot 2 jaar inactiviteit.</li>
        </ul>
      </DashboardCard>
      <DashboardCard title="Duale toestemming" subtitle="Voorwaarden voor activering">
        <p style={{ margin: 0, fontWeight: 700, color: '#1A1F2E' }}>De Familiar Voice functie vereist dual consent — zowel u (familielid) als uw naaste moeten actief toestemming geven voordat de stem gebruikt wordt.</p>
        <ul style={{ paddingLeft: 18, margin: 0, fontWeight: 700, color: '#1A1F2E' }}>
          <li><strong>U</strong> (familielid) geeft toestemming om uw stem te gebruiken voor HAVEN-reacties aan uw naaste.</li>
          <li><strong>Uw naaste</strong> geeft in HAVEN expliciet toestemming om de vertrouwde stem te horen.</li>
          <li>Bij een noodsituatie (crisis) schakelt HAVEN automatisch over naar een neutrale stem — ook als de vertrouwde-stem-schakelaar aan staat.</li>
          <li>Bij elke reactie met de vertrouwde stem hoort uw naaste een korte mededeling: "Dit is HAVEN, met de stem van [naam]."</li>
        </ul>
      </DashboardCard>
      <DashboardCard title="Voorbeeldzinnen" subtitle="Lees deze in uw eigen tempo voor">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <li style={sampleStyle}>"Hallo, dit is Sarah. Ik denk vandaag aan je."</li>
          <li style={sampleStyle}>"Het is tijd voor je medicijnen. Ik ben trots op je."</li>
          <li style={sampleStyle}>"Als je iets niet vertrouwt, hang op en bel me."</li>
          <li style={sampleStyle}>"Ik ben trots op je. Je doet het goed."</li>
          <li style={sampleStyle}>"Slaap lekker. Tot morgen."</li>
        </ul>
      </DashboardCard>
      <DashboardCard title="Opname-acties" subtitle="Start of test uw opname">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button data-action="start-recording" style={primaryButtonStyle}>Start opname</button>
          <button data-action="test-voice" style={secondaryButtonStyle}>Test bestaande stem</button>
        </div>
      </DashboardCard>
      <DashboardCard title="Opnames beheren" subtitle="Bekijk en trek eerder opgenomen stemmen in">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          <li style={sampleStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900 }}>Sarahs stem — proefopname</div>
                <div style={{ color: '#6B7490', fontSize: 12 }}>Opgenomen 14 dagen geleden · status: gereed</div>
              </div>
              <button data-action="voice-revoke" data-voice-profile-id="vp-sarah-1" style={dangerButtonStyle}>Trek in</button>
            </div>
          </li>
          <li style={sampleStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900 }}>Lucas stem — tweede poging</div>
                <div style={{ color: '#6B7490', fontSize: 12 }}>Opgenomen 3 dagen geleden · status: pending</div>
              </div>
              <button data-action="voice-revoke" data-voice-profile-id="vp-lucas-2" style={dangerButtonStyle}>Trek in</button>
            </div>
          </li>
        </ul>
        <p style={{ marginTop: 16, fontSize: 14, color: '#6B7490' }}>Door op "Trek in" te klikken wordt het voice profile direct ingetrokken en uit de instellingen van uw naaste verwijderd. Deze actie kan niet ongedaan gemaakt worden.</p>
      </DashboardCard>
      <p style={{ marginTop: 24, fontSize: 14, color: '#6B7490' }}>Status: nog niet opgenomen. Zodra u klaar bent, kunt u de stem aanzetten in de instellingen van uw naaste.</p>
      <nav style={{ marginTop: 16 }}>
        <Link href="/dashboard" style={navLinkStyle}>Terug naar dashboard</Link>
      </nav>
    </main>
  );
}

const sampleStyle: React.CSSProperties = { padding: 12, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E8EBF2', fontWeight: 700 };
const primaryButtonStyle: React.CSSProperties = { background: '#2C3E6B', color: '#FFFFFF', padding: '12px 18px', borderRadius: 18, fontWeight: 900, minHeight: 56, border: 'none', cursor: 'pointer' };
const secondaryButtonStyle: React.CSSProperties = { background: '#FFFFFF', color: '#2C3E6B', padding: '12px 18px', borderRadius: 18, fontWeight: 900, minHeight: 56, border: '2px solid #2C3E6B', cursor: 'pointer' };
const dangerButtonStyle: React.CSSProperties = { background: '#FAE8E8', color: '#C94A4A', padding: '10px 14px', borderRadius: 14, fontWeight: 900, minHeight: 48, border: '2px solid #C94A4A', cursor: 'pointer', fontSize: 14 };
const navLinkStyle: React.CSSProperties = { background: '#2C3E6B', color: '#FFFFFF', padding: '12px 18px', borderRadius: 18, fontWeight: 900, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 56 };
