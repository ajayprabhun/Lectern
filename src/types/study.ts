export type SubjectColor = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'cyan';

export type SourceType = 'paste' | 'file' | 'live';

export interface NoteDefinition {
  term: string;
  definition: string;
}

export interface GeneratedNotesPayload {
  notesSummary: string;
  notesBullets: string[];
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
  suggestedTags?: string[];
}

export interface SubjectRecord {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  color: SubjectColor;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WeekRecord {
  id: string;
  ownerId: string;
  subjectId: string;
  weekNumber: number;
  title: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LectureRecord {
  id: string;
  ownerId: string;
  subjectId: string;
  weekId: string;
  title: string;
  transcript: string;
  notesSummary: string;
  notesBullets: string[];
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
  tags: string[];
  revisionReady: boolean;
  sourceType: SourceType;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PdfExportRequest {
  subjectName: string;
  subjectCode: string;
  weekNumber: number;
  weekTitle: string;
  lectureTitle: string;
  tags: string[];
  revisionReady: boolean;
  notesSummary: string;
  notesBullets: string[];
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
}
