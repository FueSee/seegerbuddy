import type { TFunction } from 'i18next';
import type { CustomFailureMaterial } from '../api/client';
import { parseUTCDate } from './date';

/** Display name for a reason code (e.g. "fail_reason_08"); falls back to the code itself. */
export function customFailureReasonLabel(t: TFunction, code: string): string {
  return t(`customFailure.reasons.${code}`, { defaultValue: code });
}

/** Local date as YYYY-MM-DD. */
export function formatIsoDay(dateStr: string | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date) return '–';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Accepts "#FFFFFF", "FFFFFF" or 8-digit RGBA ("FFFFFFFF") and returns "#RRGGBB", or null. */
export function normalizeFilamentColor(color: string | null | undefined): string | null {
  const hex = (color ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
  return `#${hex.slice(0, 6).toUpperCase()}`;
}

/** Total grams: the report's total, or the sum of the per-material amounts. */
export function totalMaterialGrams(materials: CustomFailureMaterial[], total: number | null): number | null {
  if (total != null) return total;
  const known = materials.filter((m) => m.grams != null);
  return known.length ? known.reduce((sum, m) => sum + (m.grams ?? 0), 0) : null;
}

export function formatGrams(grams: number | null | undefined): string {
  if (grams == null) return '–';
  return `${grams >= 100 ? Math.round(grams) : grams.toFixed(1)} g`;
}
