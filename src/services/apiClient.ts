import { auth } from './firebaseClient.ts';
import type { GeneratedNotesPayload, PdfExportRequest } from '../types/study.ts';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google to use this feature.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export interface ExtractResponse {
  text: string;
  fileName: string;
  charCount: number;
  wordCount: number;
  wasTruncated: boolean;
}

export async function uploadAndExtractTranscript(file: File): Promise<ExtractResponse> {
  const headers = await getAuthHeaders();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/transcript/extract', {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = (await response.json()) as Partial<ExtractResponse> & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to extract transcript text from file.');
  }
  return data as ExtractResponse;
}

export interface GenerationProgress {
  stage: string;
  message: string;
  current?: number;
  total?: number;
}

export interface GenerationResult {
  notes: GeneratedNotesPayload;
  metadata: {
    model: string;
    chunksProcessed: number;
    stagesUsed: 'single-pass' | 'staged-chunk-merge';
  };
}

export async function generateStudyNotesStream(
  params: {
    transcript: string;
    subjectName: string;
    weekNumber: number;
    lectureTitle: string;
  },
  onProgress: (progress: GenerationProgress) => void
): Promise<GenerationResult> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/notes/generate', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      stream: true,
    }),
  });

  if (!response.ok) {
    let message = 'Failed to generate study notes.';
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson.error) message = errJson.error;
    } catch {
      // Ignore parse failure
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Streaming response unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: GenerationResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      const lines = block.split('\n');
      let eventType = 'message';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLine += line.slice(5).trim();
        }
      }
      if (!dataLine) continue;

      const parsed = JSON.parse(dataLine) as Record<string, unknown>;
      if (eventType === 'progress') {
        onProgress(parsed as unknown as GenerationProgress);
      } else if (eventType === 'error') {
        throw new Error(String(parsed.error || 'Gemini generation error.'));
      } else if (eventType === 'result') {
        finalResult = parsed as unknown as GenerationResult;
      }
    }
  }

  if (!finalResult) {
    throw new Error('Note generation did not return a complete result.');
  }
  return finalResult;
}

export async function downloadNotesPdf(payload: PdfExportRequest): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/pdf/export', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Failed to export PDF.';
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson.error) message = errJson.error;
    } catch {
      // Ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const safeName =
    payload.lectureTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'study-notes';

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeName}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
