# HAVEN Production Runbook

## 1. Local verification

```bash
cd Haven-build
npm run validate:suite
supabase start
supabase db reset
supabase functions serve --env-file supabase/functions/.env.local
```

## 2. Supabase deploy sequence

1. Create a Supabase project in the EU region.
2. Link the project with the Supabase project reference from the protected deployment environment.
3. Apply migrations with `supabase db push`.
4. Deploy Edge Functions with `supabase functions deploy`.
5. Insert production secrets into Supabase Vault and function secrets.
6. Confirm RLS is enabled and forced for user-data tables.
7. Confirm storage buckets are private.
8. Run a test elder, family and carer account through onboarding.

## 3. Required function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HAVEN_ENV`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `EXPO_ACCESS_TOKEN`
- `SENTRY_DSN`

## 4. Production smoke test

1. Elder confirms a medication by voice.
2. Medication reminder row changes to `ingenomen`.
3. Family dashboard summary updates.
4. Scam pipeline receives a suspicious bank-helpdesk input.
5. `scam_events` row is created with scores.
6. Family notification row is created for `rood` or `zwart` level.
7. Location ingest creates a fuzzed event and nulls precise coordinates after TTL.
8. BUURT discovery returns counts only and never returns another elder identifier.
9. Companion memory insert is private to elder and not visible to family.
10. WACHT care visit log is visible only to the consented carer and elder.

## 5. Non-engineering launch gates

- DPIA signed by the DPO.
- Vendor register complete with DPA status.
- DPO or privacy officer named in the compliance record.
- External penetration test complete.
- Real elder usability testing complete.
