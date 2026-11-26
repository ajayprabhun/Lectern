import type { NoteDefinition, SubjectColor } from '../types/study.ts';

/**
 * Validation constants synchronized with firebase-blueprint.json & firestore.rules.
 */
export const VALIDATION_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  SUBJECT_NAME_MAX: 120,
  SUBJECT_CODE_MAX: 24,
  WEEK_MIN: 1,
  WEEK_MAX: 52,
  WEEK_TITLE_MAX: 160,
  LECTURE_TITLE_MAX: 200,
  TRANSCRIPT_MAX: 250000,
  SUMMARY_MAX: 20000,
  BULLETS_MAX_ITEMS: 60,
  BULLET_ITEM_MAX: 1000,
  DEFINITIONS_MAX_ITEMS: 40,
  DEFINITION_TERM_MAX: 160,
  DEFINITION_BODY_MAX: 1000,
  EXAMPLES_MAX_ITEMS: 30,
  EXAMPLE_ITEM_MAX: 1500,
  TAGS_MAX_ITEMS: 10,
  TAG_ITEM_MAX: 40,
} as const;

export const ALLOWED_SUBJECT_COLORS: readonly SubjectColor[] = [
  'blue',
  'emerald',
  'amber',
  'rose',
  'violet',
  'cyan',
] as const;

export const DEFAULT_STUDY_TAGS: readonly string[] = [
  'Important',
  'Formula',
  'Definition',
  'Exam Focus',
  'Case Study',
] as const;

export function clampString(value: string, maxLen: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function sanitizeTranscript(value: string): string {
  return value.length > VALIDATION_LIMITS.TRANSCRIPT_MAX
    ? value.slice(0, VALIDATION_LIMITS.TRANSCRIPT_MAX)
    : value;
}

export function sanitizeBullets(bullets: string[]): string[] {
  return bullets
    .map((b) => clampString(b, VALIDATION_LIMITS.BULLET_ITEM_MAX))
    .filter((b) => b.length > 0)
    .slice(0, VALIDATION_LIMITS.BULLETS_MAX_ITEMS);
}

export function sanitizeDefinitions(defs: NoteDefinition[]): NoteDefinition[] {
  return defs
    .map((d) => ({
      term: clampString(d.term || '', VALIDATION_LIMITS.DEFINITION_TERM_MAX),
      definition: clampString(d.definition || '', VALIDATION_LIMITS.DEFINITION_BODY_MAX),
    }))
    .filter((d) => d.term.length > 0 && d.definition.length > 0)
    .slice(0, VALIDATION_LIMITS.DEFINITIONS_MAX_ITEMS);
}

export function sanitizeExamples(examples: string[]): string[] {
  return examples
    .map((e) => clampString(e, VALIDATION_LIMITS.EXAMPLE_ITEM_MAX))
    .filter((e) => e.length > 0)
    .slice(0, VALIDATION_LIMITS.EXAMPLES_MAX_ITEMS);
}

export function sanitizeTags(tags: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const clean = clampString(raw, VALIDATION_LIMITS.TAG_ITEM_MAX);
    const key = clean.toLowerCase();
    if (clean.length > 0 && !seen.has(key)) {
      seen.add(key);
      unique.push(clean);
    }
    if (unique.length >= VALIDATION_LIMITS.TAGS_MAX_ITEMS) {
      break;
    }
  }
  return unique;
}
