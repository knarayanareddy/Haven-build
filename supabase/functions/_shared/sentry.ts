/**
 * Sentry-compatible error reporting for Edge Functions.
 *
 * October 2026 fixes:
 *  • Posts to the *envelope* endpoint (`/api/<project>/envelope/`), which is what
 *    Sentry accepts with a plain `X-Sentry-Auth` header. The previous version
 *    POSTed JSON to the bare DSN, which Sentry answers with 405 — i.e. no report
 *    was ever stored even when SENTRY_DSN was configured correctly.
 *  • Sends a real event payload (exception values + stacktrace + release +
 *    environment) instead of a bare `{message}` object.
 *  • Honours the `HAVEN_RELEASE` / `HAVEN_ENVIRONMENT` variables so reports can be
 *    tied to a deploy, and never throws.
 *  • Keeps the DSN format validation, now covering self-hosted hosts as well as
 *    *.ingest.{us,de}.sentry.io.
 *
 * Everything stays fire-and-forget with a hard timeout: telemetry must never be
 * able to delay or fail a user-facing request.
 */

import { readEnv } from './env.ts';

const DEFAULT_TIMEOUT_MS = 2000;

export interface SentryConfig {
  dsn: string;
  endpoint: string;
  publicKey: string;
  projectId: string;
}

/**
 * Parses a DSN into the ingest endpoint.
 * Accepts both SaaS (https://<key>@o1.ingest.us.sentry.io/123) and self-hosted
 * (https://<key>@sentry.example.org/123) URLs, and rejects anything else so a
 * malformed DSN can never receive our payloads.
 */
export function parseDsn(dsn: string | null | undefined): SentryConfig | null {
  if (!dsn) return null;
  const trimmed = dsn.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!publicKey || !/^\d+$/.test(projectId)) return null;
  if (!url.hostname.includes('.')) return null;
  return {
    dsn: trimmed,
    endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    publicKey,
    projectId,
  };
}

/** Redacts values whose key looks like PII or a credential. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /email|phone|name|token|transcript|audio|address|secret|key|password|pin|bsn|iban|ip/i.test(k)
        ? '[redacted]'
        : scrub(v);
    }
    return out;
  }
  return value;
}

function exceptionFrom(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      value: error.message,
      stacktrace: error.stack
        ? { frames: error.stack.split('\n').slice(1, 30).reverse().map((line) => ({ filename: line.trim() })) }
        : undefined,
    };
  }
  return { type: 'NonError', value: String(error).slice(0, 1000) };
}

/** Builds the Sentry envelope. Pure, so it is unit-testable. */
export function buildEnvelope(error: unknown, context: Record<string, unknown> = {}) {
  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: 'error',
    environment: readEnv('HAVEN_ENVIRONMENT') ?? 'production',
    release: readEnv('HAVEN_RELEASE') ?? undefined,
    exception: { values: [exceptionFrom(error)] },
    extra: scrub(context),
    tags: {
      function: String(context.fn ?? 'unknown'),
      error_code: String(context.error_code ?? 'INTERNAL'),
    },
  };
  return { eventId, event };
}

export async function captureException(error: unknown, context: Record<string, unknown> = {}) {
  const config = parseDsn(readEnv('SENTRY_DSN'));
  if (!config) return;

  const { event } = buildEnvelope(error, context);
  const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${config.publicKey}, sentry_client=haven-edge/1.0`,
      },
      body: envelope,
      signal: controller.signal,
    });
  } catch {
    // Never throw from error reporting.
  } finally {
    clearTimeout(timer);
  }
}
