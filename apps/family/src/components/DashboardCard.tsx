import React from 'react';

export function DashboardCard(props: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#FFFFFF', borderRadius: 24, padding: 24, boxShadow: '0 14px 40px rgba(44,62,107,.12)', border: '1px solid #E8EBF2' }}>
      <h2 style={{ margin: 0, color: '#1A1F2E' }}>{props.title}</h2>
      {props.subtitle ? <p style={{ color: '#6B7490', fontWeight: 700 }}>{props.subtitle}</p> : null}
      {props.children}
    </section>
  );
}
