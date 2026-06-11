import { admin, sha256 } from './core.ts';

export async function withIdempotency<T>(params: {
  key?: string | null;
  functionName: string;
  elderId?: string;
  profileId?: string;
  requestBody: unknown;
  run: () => Promise<{ status?: number; body: T }>;
}) {
  if (!params.key) return params.run();
  const db = admin();
  const keyHash = await sha256(`${params.functionName}:${params.key}`);
  const requestHash = await sha256(JSON.stringify(params.requestBody));
  const existing = await db.from('idempotency_keys').select('*').eq('key_hash', keyHash).maybeSingle();
  if (existing.data?.completed_at) return { status: existing.data.status_code ?? 200, body: existing.data.response_body as T };
  if (!existing.data) {
    await db.from('idempotency_keys').insert({ key_hash: keyHash, function_name: params.functionName, elder_id: params.elderId, profile_id: params.profileId, request_hash: requestHash });
  } else if (existing.data.request_hash !== requestHash) {
    throw new Error('Idempotency key was reused with a different request body');
  }
  const result = await params.run();
  await db.from('idempotency_keys').update({ response_body: result.body, status_code: result.status ?? 200, completed_at: new Date().toISOString() }).eq('key_hash', keyHash);
  return result;
}
