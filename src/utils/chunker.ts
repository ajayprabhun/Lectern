export interface TranscriptStats {
  characters: number;
  words: number;
  estimatedChunks: number;
}

export const DEFAULT_CHUNK_SIZE = 9000;
export const DEFAULT_CHUNK_OVERLAP = 250;

export function getTranscriptStats(text: string, chunkSize = DEFAULT_CHUNK_SIZE): TranscriptStats {
  const normalized = text.trim();
  if (!normalized) {
    return { characters: 0, words: 0, estimatedChunks: 0 };
  }
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const chunks = chunkTranscript(normalized, chunkSize, DEFAULT_CHUNK_OVERLAP);
  return {
    characters: normalized.length,
    words,
    estimatedChunks: chunks.length,
  };
}

/**
 * Splits long lecture transcripts along paragraph or sentence boundaries
 * so each Gemini Flash call stays well within optimal token limits.
 */
export function chunkTranscript(
  rawText: string,
  maxChunkChars = DEFAULT_CHUNK_SIZE,
  overlapChars = DEFAULT_CHUNK_OVERLAP
): string[] {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxChunkChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkChars, text.length);

    if (end < text.length) {
      // Prefer breaking on paragraph, then newline, then sentence end, then whitespace.
      const minBreakPoint = start + Math.floor(maxChunkChars * 0.6);
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const lineBreak = text.lastIndexOf('\n', end);
      const sentenceBreak = Math.max(
        text.lastIndexOf('. ', end),
        text.lastIndexOf('? ', end),
        text.lastIndexOf('! ', end)
      );
      const spaceBreak = text.lastIndexOf(' ', end);

      if (paragraphBreak >= minBreakPoint) {
        end = paragraphBreak + 2;
      } else if (lineBreak >= minBreakPoint) {
        end = lineBreak + 1;
      } else if (sentenceBreak >= minBreakPoint) {
        end = sentenceBreak + 2;
      } else if (spaceBreak >= minBreakPoint) {
        end = spaceBreak + 1;
      }
    }

    const slice = text.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push(slice);
    }

    if (end >= text.length) break;

    const nextStart = Math.max(end - overlapChars, start + 1);
    start = nextStart;
  }

  return chunks;
}
