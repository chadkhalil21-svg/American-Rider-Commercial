// A scheduled Travel is stored by the backend with an authoritative cent-denominated
// total (costCents). Older records may contain only a legacy dollar value (cost).
// Do not invent $0.00 for malformed or incomplete reservation records.
export function scheduledDisplayTotal(
  record: { costCents?: unknown; cost?: unknown } | null | undefined,
): number | null {
  if (!record) return null;
  if (typeof record.costCents === 'number' &&
      Number.isSafeInteger(record.costCents) && record.costCents > 0) {
    return record.costCents / 100;
  }
  if (typeof record.cost === 'number' &&
      Number.isFinite(record.cost) && record.cost > 0) {
    return Math.round(record.cost * 100) / 100;
  }
  return null;
}
