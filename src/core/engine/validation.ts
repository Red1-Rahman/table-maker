import type { TableSchema, ValidationRule, ValidationType } from '@/types/schema';
import { rangeContains } from './address';

export const VALIDATION_LABELS: Record<ValidationType, string> = {
  text: 'Text',
  number: 'Number',
  select: 'Select dropdown',
  date: 'Date',
  email: 'Email',
  url: 'URL',
  checkbox: 'Checkbox',
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function rulesForCell(doc: Pick<TableSchema, 'validations'>, r: number, c: number): ValidationRule[] {
  return doc.validations.filter((v) => rangeContains(v.range, r, c));
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateValue(rule: ValidationRule, value: string): ValidationResult {
  if (value === '' || value.startsWith('=')) return { ok: true };
  switch (rule.type) {
    case 'text':
      return { ok: true };
    case 'number': {
      const n = Number(value);
      if (value.trim() === '' || Number.isNaN(n)) return { ok: false, message: 'Enter a number.' };
      if (rule.min !== undefined && n < rule.min) return { ok: false, message: `Must be ≥ ${rule.min}.` };
      if (rule.max !== undefined && n > rule.max) return { ok: false, message: `Must be ≤ ${rule.max}.` };
      return { ok: true };
    }
    case 'select':
      return rule.options?.includes(value)
        ? { ok: true }
        : { ok: false, message: `Choose one of: ${(rule.options ?? []).join(', ')}.` };
    case 'date':
      return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
        ? { ok: true }
        : { ok: false, message: 'Use the date format YYYY-MM-DD.' };
    case 'email':
      return EMAIL.test(value) ? { ok: true } : { ok: false, message: 'Enter a valid email address.' };
    case 'url':
      return URL_RE.test(value) ? { ok: true } : { ok: false, message: 'Enter a URL starting with http(s)://' };
    case 'checkbox':
      return /^(true|false)$/i.test(value) ? { ok: true } : { ok: false, message: 'Use TRUE or FALSE.' };
  }
}

export function validateInput(doc: Pick<TableSchema, 'validations'>, r: number, c: number, value: string): ValidationResult {
  for (const rule of rulesForCell(doc, r, c)) {
    const res = validateValue(rule, value);
    if (!res.ok) return res;
  }
  return { ok: true };
}
