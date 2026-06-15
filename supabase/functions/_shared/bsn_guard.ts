// ─── Authoritative Server-Side BSN Guard (Dutch 11-proef Enforcement) ───

export function isValid11Proef(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
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

  // 2. Sliding window scanning all contiguous 9-digit sequences
  for (let i = 0; i <= clean.length - 9; i++) {
    const candidate = clean.slice(i, i + 9);
    if (/^\d{9}$/.test(candidate)) {
      if (isValid11Proef(candidate)) return true;
    }
  }
  return false;
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

export function assertNoBsnInPayload(body: unknown): void {
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  if (containsBsn(serialized)) {
    const err = new Error("422: Prohibited Dutch Citizen Service Number (BSN) detected. Storage, transmission, and processing of BSN is strictly prohibited.");
    (err as unknown as { status: number; isBsnViolation: boolean }).status = 422;
    (err as unknown as { status: number; isBsnViolation: boolean }).isBsnViolation = true;
    throw err;
  }
}
