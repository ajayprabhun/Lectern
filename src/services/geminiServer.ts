import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { GeneratedNotesPayload } from '../types/study.ts';
import { chunkTranscript } from '../utils/chunker.ts';
import {
  clampString,
  DEFAULT_STUDY_TAGS,
  sanitizeBullets,
  sanitizeDefinitions,
  sanitizeExamples,
  sanitizeTags,
  VALIDATION_LIMITS,
} from '../utils/validation.ts';

const FLASH_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isNonRetryable =
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('INVALID_ARGUMENT');
      if (isNonRetryable || attempt === maxAttempts) {
        break;
      }
      const delayMs = 600 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

const NOTES_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    notesSummary: {
      type: Type.STRING,
      description: 'A clear, concise 3-5 sentence executive summary synthesizing the core lecture thesis and outcomes.',
    },
    notesBullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Concise, high-signal study bullet points covering key concepts, mechanisms, and takeaways.',
    },
    notesDefinitions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING, description: 'Key term, concept, or formula name.' },
          definition: { type: Type.STRING, description: 'Clear, accurate academic definition or formula explanation.' },
        },
      },
      description: 'Important terms, concepts, or formulas defined in the lecture.',
    },
    notesExamples: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Concrete examples, worked problems, or real-world applications mentioned in the lecture.',
    },
    suggestedTags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 short study tags chosen from Important, Formula, Definition, Exam Focus, Case Study, or topic keywords.',
    },
  },
};

const CHUNK_SUMMARY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segmentSummary: {
      type: Type.STRING,
      description: 'Concise 2-3 sentence summary of this lecture segment.',
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Key conceptual points or steps explained in this segment.',
    },
    definitions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
      },
      description: 'Technical terms or formulas introduced in this segment.',
    },
    examples: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Concrete examples or case studies from this segment.',
    },
  },
};

interface ChunkSummaryOutput {
  segmentSummary: string;
  keyPoints: string[];
  definitions: Array<{ term: string; definition: string }>;
  examples: string[];
}

export interface NotesGenerationResult {
  notes: GeneratedNotesPayload;
  metadata: {
    model: string;
    chunksProcessed: number;
    stagesUsed: 'single-pass' | 'staged-chunk-merge';
  };
}

function normalizeNotesOutput(raw: Partial<GeneratedNotesPayload>): GeneratedNotesPayload {
  const validTags = sanitizeTags(
    Array.isArray(raw.suggestedTags) && raw.suggestedTags.length > 0
      ? raw.suggestedTags
      : [DEFAULT_STUDY_TAGS[0]]
  );
  return {
    notesSummary: clampString(raw.notesSummary || '', VALIDATION_LIMITS.SUMMARY_MAX),
    notesBullets: sanitizeBullets(Array.isArray(raw.notesBullets) ? raw.notesBullets : []),
    notesDefinitions: sanitizeDefinitions(Array.isArray(raw.notesDefinitions) ? raw.notesDefinitions : []),
    notesExamples: sanitizeExamples(Array.isArray(raw.notesExamples) ? raw.notesExamples : []),
    suggestedTags: validTags,
  };
}

async function summarizeChunk(
  ai: GoogleGenAI,
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  context: { subjectName: string; lectureTitle: string }
): Promise<ChunkSummaryOutput> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `Subject: ${context.subjectName}\nLecture: ${context.lectureTitle}\nSegment ${chunkIndex + 1} of ${totalChunks}:\n\n${chunkText}`,
      config: {
        systemInstruction:
          'You are an academic note-taking assistant. Extract concise, accurate study points, term definitions, and concrete examples from this lecture transcript segment. Keep every point crisp and free of filler.',
        responseMimeType: 'application/json',
        responseSchema: CHUNK_SUMMARY_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const parsed = JSON.parse((response.text || '{}').trim()) as Partial<ChunkSummaryOutput>;
    return {
      segmentSummary: parsed.segmentSummary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      definitions: Array.isArray(parsed.definitions) ? parsed.definitions : [],
      examples: Array.isArray(parsed.examples) ? parsed.examples : [],
    };
  });
}

export async function generateStudyNotesFromTranscript(params: {
  transcript: string;
  subjectName: string;
  weekNumber: number;
  lectureTitle: string;
  onProgress?: (event: { stage: string; message: string; current?: number; total?: number }) => void;
}): Promise<NotesGenerationResult> {
  const ai = getGeminiClient();
  const chunks = chunkTranscript(params.transcript);
  if (chunks.length === 0) {
    throw new Error('Transcript text is empty.');
  }

  // Stage 1: Single-pass optimization for short/medium transcripts
  if (chunks.length === 1) {
    params.onProgress?.({
      stage: 'synthesizing',
      message: 'Generating structured study notes with Gemini Flash...',
      current: 1,
      total: 1,
    });

    const notes = await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: `Subject: ${params.subjectName}\nWeek: ${params.weekNumber}\nLecture Title: ${params.lectureTitle}\n\nTranscript:\n${chunks[0]}`,
        config: {
          systemInstruction:
            'You are an academic study-notes synthesizer for university students. Produce concise, exam-ready structured notes from the lecture transcript: a 3-5 sentence executive summary, 6-14 crisp bullet points, key term definitions, concrete examples, and 2-4 relevant study tags (preferring "Important", "Formula", "Definition", "Exam Focus", "Case Study" where applicable). Be accurate and grounded strictly in the transcript.',
          responseMimeType: 'application/json',
          responseSchema: NOTES_RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        },
      });
      const parsed = JSON.parse((response.text || '{}').trim()) as Partial<GeneratedNotesPayload>;
      return normalizeNotesOutput(parsed);
    });

    return {
      notes,
      metadata: {
        model: FLASH_MODEL,
        chunksProcessed: 1,
        stagesUsed: 'single-pass',
      },
    };
  }

  // Multi-stage pipeline for long transcripts:
  // Stage 1: Chunk transcript -> Stage 2: Summarize each chunk -> Stage 3: Merge summaries
  params.onProgress?.({
    stage: 'chunking',
    message: `Split transcript into ${chunks.length} segments for token-efficient processing`,
    current: 0,
    total: chunks.length,
  });

  const chunkSummaries: ChunkSummaryOutput[] = new Array(chunks.length);
  const concurrency = 3;
  let completed = 0;

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((chunkText, offset) =>
        summarizeChunk(ai, chunkText, i + offset, chunks.length, {
          subjectName: params.subjectName,
          lectureTitle: params.lectureTitle,
        })
      )
    );
    batchResults.forEach((res, offset) => {
      chunkSummaries[i + offset] = res;
      completed += 1;
    });
    params.onProgress?.({
      stage: 'summarizing',
      message: `Summarized ${completed} of ${chunks.length} transcript segments`,
      current: completed,
      total: chunks.length,
    });
  }

  params.onProgress?.({
    stage: 'merging',
    message: 'Merging segment summaries into final structured study notes...',
    current: chunks.length,
    total: chunks.length,
  });

  const mergedSource = chunkSummaries
    .map((cs, idx) => {
      const defs = cs.definitions.map((d) => `- ${d.term}: ${d.definition}`).join('\n');
      const pts = cs.keyPoints.map((p) => `- ${p}`).join('\n');
      const exs = cs.examples.map((e) => `- ${e}`).join('\n');
      return `=== Segment ${idx + 1} ===\nSummary: ${cs.segmentSummary}\nKey Points:\n${pts}\nDefinitions:\n${defs}\nExamples:\n${exs}`;
    })
    .join('\n\n');

  const mergedNotes = await withRetry(async () => {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `Subject: ${params.subjectName}\nWeek: ${params.weekNumber}\nLecture Title: ${params.lectureTitle}\n\nSegment Summaries:\n${mergedSource}`,
      config: {
        systemInstruction:
          'You are an academic study-notes synthesizer. Merge these sequential lecture segment summaries into one unified, deduplicated, concise set of study notes. Produce a 3-5 sentence executive summary, 8-18 high-signal bullet points, unified definitions without duplicates, concrete examples, and 2-4 relevant study tags.',
        responseMimeType: 'application/json',
        responseSchema: NOTES_RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });
    const parsed = JSON.parse((response.text || '{}').trim()) as Partial<GeneratedNotesPayload>;
    return normalizeNotesOutput(parsed);
  });

  return {
    notes: mergedNotes,
    metadata: {
      model: FLASH_MODEL,
      chunksProcessed: chunks.length,
      stagesUsed: 'staged-chunk-merge',
    },
  };
}
