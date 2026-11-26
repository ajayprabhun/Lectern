import { useRef, useState } from 'react';
import {
  AlertCircle,
  ClipboardPaste,
  FileUp,
  Loader2,
  Mic,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import type { GenerationProgress } from '../services/apiClient.ts';
import { uploadAndExtractTranscript } from '../services/apiClient.ts';
import type { LectureRecord, SourceType } from '../types/study.ts';
import { getTranscriptStats } from '../utils/chunker.ts';

interface TranscriptPanelProps {
  lecture: LectureRecord;
  title: string;
  transcript: string;
  sourceType: SourceType;
  isGenerating: boolean;
  generationProgress: GenerationProgress | null;
  generationError: string | null;
  hasExistingNotes: boolean;
  onChangeTitle: (value: string) => void;
  onChangeTranscript: (value: string, source: SourceType) => void;
  onGenerateNotes: () => Promise<void>;
}

export function TranscriptPanel({
  lecture,
  title,
  transcript,
  sourceType,
  isGenerating,
  generationProgress,
  generationError,
  hasExistingNotes,
  onChangeTitle,
  onChangeTranscript,
  onGenerateNotes,
}: TranscriptPanelProps) {
  const [activeTab, setActiveTab] = useState<SourceType>(sourceType || 'paste');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [liveStatusMessage, setLiveStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stats = getTranscriptStats(transcript);

  const handleFileProcess = async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);
    try {
      const result = await uploadAndExtractTranscript(file);
      onChangeTranscript(result.text, 'file');
      setUploadSuccess(
        `Loaded ${result.fileName} (${result.wordCount.toLocaleString()} words)${
          result.wasTruncated ? ' — trimmed to max limit' : ''
        }.`
      );
      setActiveTab('paste');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to read uploaded file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
  };

  return (
    <section
      data-section="transcript-panel"
      className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Lecture Title & Input Mode Bar */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div>
          <label htmlFor={`lecture-title-${lecture.id}`} className="sr-only">
            Lecture Title
          </label>
          <input
            id={`lecture-title-${lecture.id}`}
            type="text"
            maxLength={200}
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder="Lecture Title (e.g., Lecture 4: Virtual Memory & Paging)"
            className="w-full text-lg font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-0 border-b border-transparent focus:border-blue-500 focus:outline-none pb-1 placeholder:text-slate-400"
          />
        </div>

        {/* Source Input Mode Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'paste'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste Text
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'file'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'live'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              Live Capture
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {stats.words.toLocaleString()} words · {stats.estimatedChunks}{' '}
            {stats.estimatedChunks === 1 ? 'chunk' : 'chunks'}
          </div>
        </div>
      </div>

      {/* Upload Feedback Banners */}
      {uploadError && (
        <div className="mx-5 mt-4 px-3.5 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}
      {uploadSuccess && (
        <div className="mx-5 mt-4 px-3.5 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
          {uploadSuccess}
        </div>
      )}

      {/* Body based on activeTab */}
      <div className="flex-1 flex flex-col p-5 min-h-[380px]">
        {activeTab === 'file' && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileProcess(file);
                e.target.value = '';
              }}
            />
            {isUploading ? (
              <div className="space-y-3">
                <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Extracting transcript text...
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Parsing document on the server
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-w-xs">
                <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-600 dark:text-slate-300">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Drop a transcript file here
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Supports .txt, .pdf, and .docx files up to 15 MB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-colors"
                >
                  Choose File
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'live' && (
          <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-8 text-center">
            <div className="max-w-sm space-y-4">
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-600 dark:text-slate-300">
                <Mic className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Live Classroom Transcription
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Interface preview for upcoming real-time lecture audio capture. Live streaming
                  transcription will connect directly into this transcript buffer in a future update.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setLiveStatusMessage(
                      'Live audio streaming is scheduled for a future milestone. Use Paste Text or Upload File (.txt, .pdf, .docx) to generate notes today.'
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Test Live Capture Preview
                </button>
              </div>
              {liveStatusMessage && (
                <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-3 py-2">
                  {liveStatusMessage}
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'paste' && (
          <div className="flex-1 flex flex-col">
            <label htmlFor={`transcript-input-${lecture.id}`} className="sr-only">
              Lecture Transcript Text
            </label>
            <textarea
              id={`transcript-input-${lecture.id}`}
              value={transcript}
              onChange={(e) => onChangeTranscript(e.target.value, 'paste')}
              placeholder="Paste your raw lecture transcript here, or switch to Upload File (.txt, .pdf, .docx)..."
              className="flex-1 w-full min-h-[340px] resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/50 p-4 text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* Footer Generation Controls */}
      <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 space-y-2.5">
        {generationError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{generationError}</span>
          </div>
        )}

        {isGenerating && generationProgress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>{generationProgress.message}</span>
              {generationProgress.total && generationProgress.total > 1 && (
                <span className="tabular-nums font-mono">
                  {generationProgress.current || 0}/{generationProgress.total}
                </span>
              )}
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                style={{
                  width:
                    generationProgress.total && generationProgress.total > 0
                      ? `${Math.max(
                          12,
                          Math.round(((generationProgress.current || 0) / generationProgress.total) * 100)
                        )}%`
                      : '45%',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {stats.estimatedChunks > 1
              ? `Long transcript (${stats.estimatedChunks} chunks): staged Flash summarization`
              : 'Single-pass Flash synthesis'}
          </span>
          <button
            type="button"
            disabled={isGenerating || transcript.trim().length < 20}
            onClick={() => void onGenerateNotes()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Notes...
              </>
            ) : hasExistingNotes ? (
              <>
                <RefreshCw className="w-4 h-4" />
                Re-generate Notes
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                Generate Study Notes
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
