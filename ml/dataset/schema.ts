export type ScamChannel = 'phone_call' | 'sms' | 'whatsapp' | 'email' | 'web_page' | 'letter' | 'in_person';
export type DatasetSplit = 'train' | 'validation' | 'test' | 'holdout';
export type DataQuality = 'gold' | 'silver' | 'bronze' | 'review_needed';

export interface HavenScamDatasetRecord {
  id: string;
  dataset_version: string;
  created_at: string;
  locale: 'nl-NL' | 'en-GB';
  source: 'fraudehelpdesk' | 'politie_nl' | 'bank_public_warning' | 'synthetic_llm_generated' | 'expert_crafted' | 'benign';
  signal: {
    channel: ScamChannel;
    year: number;
    sender_identifier_hash?: string;
    domain_age_days?: number;
    phone_reputation_score?: number;
  };
  labels: {
    is_scam: boolean;
    confidence: 'certain' | 'likely' | 'possible' | 'uncertain';
    recommended_alert_level: 'none' | 'amber' | 'rood' | 'zwart';
    threat_types: Array<'bankhelpdeskfraude' | 'vriend_in_nood' | 'overheid_impersonatie' | 'romantische_fraude' | 'investeringsfraude' | 'pakketfraude' | 'phishing' | 'andere' | 'benign'>;
    uses_urgency: boolean;
    uses_authority: boolean;
    uses_isolation: boolean;
    financial_loss_likely: boolean;
  };
  content: {
    redacted_text: string;
    pii_redacted: true;
    pii_types_removed: string[];
  };
  features: {
    urgency_phrases: string[];
    authority_phrases: string[];
    payment_phrases: string[];
    isolation_phrases: string[];
    embedding_vector?: number[];
  };
  annotation: {
    annotator_type: 'human_expert' | 'security_researcher' | 'llm_assisted' | 'rule_based';
    explanation_nl: string;
    explanation_en: string;
    safe_action_nl: string;
    safe_action_en: string;
  };
  split: DatasetSplit;
  quality: DataQuality;
}
