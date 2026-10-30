// ─── Authoritative Server-Side BSN Guard (Dutch 11-proef Enforcement) ───

export function isValid11Proef(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  // Nine zeros satisfies the modulo-11 arithmetic (0 % 11 === 0) but is not a BSN, and
  // appears constantly as a placeholder in ids and fixture data.
  if (/^0{9}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  // Modulo-11 algorithm: (9×d1 + 8×d2 + 7×d3 + 6×d4 + 5×d5 + 4×d6 + 3×d7 + 2×d8 - 1×d9) % 11 == 0
  const sum = (d[0] * 9) + (d[1] * 8) + (d[2] * 7) + (d[3] * 6) + (d[4] * 5) + (d[5] * 4) + (d[6] * 3) + (d[7] * 2) - (d[8] * 1);
  return sum % 11 === 0;
}

export function containsBsn(text?: string | null): boolean {
  if (!text) return false;
  // 1. Strip all formatting, punctuation, whitespace, and zero-width Unicode obfuscation chars
  // \u200B-\u200D\uFEFF are zero-width characters
  const clean = text.replace(/[\s\-._/,\u200B-\u200D\uFEFF]/g, "");
  if (clean.length < 9) return false;

  // 2. Scan each digit run as a whole.
  //
  // This used to slide a 9-character window across every position, which meant any run
  // of 15+ digits contained a sub-window that satisfied the modulo-11 test about one time
  // in eleven. A UUID ending in zeros produced `000000000`, which passes the arithmetic
  // outright, so ordinary requests were rejected with 422 for a BSN nobody had sent.
  //
  // A run of exactly nine digits is what a BSN looks like on the wire — formatted with
  // spaces or dashes, it collapses to nine. A BSN glued to other digits is ambiguous,
  // and guessing at it costs every other caller a rejected request.
  return clean.split(/\D+/).some((run) => run.length === 9 && isValid11Proef(run));
}

export function scrubBsnFromLogs(payload: unknown): unknown {
  if (typeof payload === "string") {
    // Scrubber removes 9-digit candidates that pass 11-proef from logged fields
    return payload.replace(/([0-9][\s\-._/,\u200B-\u200D\uFEFF]*){8}[0-9]/g, (match) => {
      const clean = match.replace(/[^0-9]/g, "");
      if (clean.length === 9 && isValid11Proef(clean)) {
        return "[REDACTED_BSN]";
      }
      return match;
    });
  }
  if (Array.isArray(payload)) {
    return payload.map(scrubBsnFromLogs);
  }
  if (payload !== null && typeof payload === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      res[k] = scrubBsnFromLogs(v);
    }
    return res;
  }
  return payload;
}

/**
 * Every scalar a request carries, as a string, without joining them together.
 *
 * The previous implementation serialised the whole body and scanned that. Since
 * containsBsn() strips punctuation and whitespace first, digits from *different fields*
 * were concatenated: `{"appetite":3,"mood":4}` plus the digits inside a UUID produced
 * nine-digit windows that passed the 11-proef, so ordinary carer handover notes were
 * rejected with 422 for containing a BSN nobody had sent. Scanning each value on its own
 * is both what the rule means and what the caller actually transmits.
 */
function scalarStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "number" || typeof value === "bigint") out.push(String(value));
  else if (Array.isArray(value)) for (const item of value) scalarStrings(item, out);
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) scalarStrings(item, out);
  }
  return out;
}

export function assertNoBsnInPayload(body: unknown): void {
  const offending = scalarStrings(body).find((value) => containsBsn(value));
  if (offending !== undefined) {
    const err = new Error("422: Prohibited Dutch Citizen Service Number (BSN) detected. Storage, transmission, and processing of BSN is strictly prohibited.");
    (err as unknown as { status: number; isBsnViolation: boolean }).status = 422;
    (err as unknown as { status: number; isBsnViolation: boolean }).isBsnViolation = true;
    (err as unknown as { code: string }).code = "UNPROCESSABLE_ENTITY";
    throw err;
  }
}
