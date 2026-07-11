// ============================================================
// Typed request validation utilities for the commercial domain.
// Deliberately dependency-free (the project does not use Zod);
// every commercial endpoint validates through these helpers.
// ============================================================

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ValidationError' }
}

export function vUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(`${field} must be a valid UUID`)
  }
  return value
}

export function vUuidOrNull(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return vUuid(value, field)
}

export function vString(value: unknown, field: string, opts: { max?: number; required?: boolean } = {}): string | null {
  if (value === null || value === undefined || value === '') {
    if (opts.required) throw new ValidationError(`${field} is required`)
    return null
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`)
  const max = opts.max ?? 10000
  if (value.length > max) throw new ValidationError(`${field} must be at most ${max} characters`)
  return value
}

export function vNumber(value: unknown, field: string, opts: { min?: number; max?: number; required?: boolean } = {}): number | null {
  if (value === null || value === undefined || value === '') {
    if (opts.required) throw new ValidationError(`${field} is required`)
    return null
  }
  const n = Number(value)
  if (!Number.isFinite(n)) throw new ValidationError(`${field} must be a number`)
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`${field} must be at least ${opts.min}`)
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`${field} must be at most ${opts.max}`)
  return n
}

export function vPercent(value: unknown, field: string, required = false): number | null {
  return vNumber(value, field, { min: 0, max: 100, required })
}

export function vDate(value: unknown, field: string, required = false): string | null {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ValidationError(`${field} is required`)
    return null
  }
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new ValidationError(`${field} must be a date in YYYY-MM-DD format`)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} is not a valid date`)
  return value
}

export function vEnum<T extends string>(value: unknown, field: string, allowed: readonly T[], opts: { required?: boolean } = {}): T | null {
  if (value === null || value === undefined || value === '') {
    if (opts.required) throw new ValidationError(`${field} is required`)
    return null
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

export function vBoolean(value: unknown, field: string, fallback: boolean | null = null): boolean | null {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'boolean') throw new ValidationError(`${field} must be a boolean`)
  return value
}
