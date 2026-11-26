import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  Layers,
  Loader2,
  Plus,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { downloadNotesPdf } from '../services/apiClient.ts';
import type { NoteDefinition, SubjectRecord, WeekRecord } from '../types/study.ts';
import { DEFAULT_STUDY_TAGS, VALIDATION_LIMITS } from '../utils/validation.ts';
import { FlashcardMode } from './FlashcardMode.tsx';

interface NotesPanelProps {
  subject: SubjectRecord | undefined;
  week: WeekRecord | undefined;
  lectureTitle: string;
  notesSummary: string;
  notesBullets: string[];
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
  tags: string[];
  revisionReady: boolean;
  isGenerating: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onUpdateNotes: (updates: {
    notesSummary?: string;
    notesBullets?: string[];
    notesDefinitions?: NoteDefinition[];
    notesExamples?: string[];
  }) => void;
  onToggleTag: (tag: string) => void;
  onToggleRevisionReady: () => void;
}

export function NotesPanel({
  subject,
  week,
  lectureTitle,
  notesSummary,
  notesBullets,
  notesDefinitions,
  notesExamples,
  tags,
  revisionReady,
  isGenerating,
  saveStatus,
  onUpdateNotes,
  onToggleTag,
  onToggleRevisionReady,
}: NotesPanelProps) {
  const [viewMode, setViewMode] = useState<'read' | 'flashcards' | 'edit'>('read');
  const [customTagInput, setCustomTagInput] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const flashcardCount = notesDefinitions.length + notesExamples.length;
  const hasContent =
    notesSummary.trim().length > 0 ||
    notesBullets.length > 0 ||
    notesDefinitions.length > 0 ||
    notesExamples.length > 0;

  const handleExportPdf = async () => {
    setPdfError(null);
    setIsExportingPdf(true);
    try {
      await downloadNotesPdf({
        subjectName: subject?.name || 'Study Subject',
        subjectCode: subject?.code || '',
        weekNumber: week?.weekNumber || 1,
        weekTitle: week?.title || 'Week 1',
        lectureTitle: lectureTitle || 'Untitled Lecture',
        tags,
        revisionReady,
        notesSummary,
        notesBullets,
        notesDefinitions,
        notesExamples,
      });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF download failed.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      onToggleTag(trimmed);
    }
    setCustomTagInput('');
  };

  return (
    <section
      data-section="notes-panel"
      className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      {/* Top Toolbar */}
      <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Study Notes
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && 'Saved to Firestore'}
            {saveStatus === 'error' && 'Save failed'}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onToggleRevisionReady}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              revisionReady
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {revisionReady ? 'Revision Ready' : 'Mark Revision Ready'}
          </button>

          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('read')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'read'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Notes
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flashcards')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                viewMode === 'flashcards'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Flashcards{flashcardCount > 0 ? ` (${flashcardCount})` : ''}
            </button>
            <button
              type="button"
              disabled={!hasContent && viewMode !== 'edit'}
              onClick={() => setViewMode('edit')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                viewMode === 'edit'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>

          <button
            type="button"
            disabled={!hasContent || isExportingPdf}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            {isExportingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Download as PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tagging Bar */}
      <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 flex items-center gap-2 flex-wrap">
        <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <div className="flex items-center gap-1.5 flex-wrap">
          {DEFAULT_STUDY_TAGS.map((preset) => {
            const active = tags.some((t) => t.toLowerCase() === preset.toLowerCase());
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onToggleTag(preset)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {active && <Check className="w-3 h-3" />}
                {preset}
              </button>
            );
          })}

          {/* Custom non-preset tags */}
          {tags
            .filter((t) => !DEFAULT_STUDY_TAGS.some((p) => p.toLowerCase() === t.toLowerCase()))
            .map((custom) => (
              <button
                key={custom}
                type="button"
                onClick={() => onToggleTag(custom)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white whitespace-nowrap shrink-0"
              >
                {custom}
                <X className="w-3 h-3" />
              </button>
            ))}
        </div>

        {tags.length < VALIDATION_LIMITS.TAGS_MAX_ITEMS && (
          <form onSubmit={handleAddCustomTag} className="inline-flex items-center gap-1 ml-auto">
            <input
              type="text"
              maxLength={VALIDATION_LIMITS.TAG_ITEM_MAX}
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              placeholder="+ Custom tag"
              className="w-28 px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
        )}
      </div>

      {pdfError && (
        <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {pdfError}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-5 overflow-y-auto space-y-6">
        {isGenerating ? (
          <div className="space-y-6 animate-pulse">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-3 w-11/12 bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-3 w-4/5 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-3 w-5/6 bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
              <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
            </div>
          </div>
        ) : viewMode === 'flashcards' ? (
          <FlashcardMode
            lectureTitle={lectureTitle}
            notesDefinitions={notesDefinitions}
            notesExamples={notesExamples}
            onSwitchToEdit={() => setViewMode('edit')}
          />
        ) : !hasContent && viewMode !== 'edit' ? (
          <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center px-6">
            <div className="max-w-sm space-y-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No study notes generated yet
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Paste a lecture transcript or upload a .txt, .pdf, or .docx file on the left, then
                select Generate Study Notes to extract key points, definitions, examples, and a
                concise summary.
              </p>
            </div>
          </div>
        ) : viewMode === 'edit' ? (
          /* Editable Mode */
          <div className="space-y-6">
            {/* Summary Edit */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Executive Summary
              </label>
              <textarea
                rows={4}
                value={notesSummary}
                onChange={(e) => onUpdateNotes({ notesSummary: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/60 p-3 text-sm leading-relaxed text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            {/* Bullets Edit */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Key Study Points
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateNotes({ notesBullets: [...notesBullets, ''] })}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Point
                </button>
              </div>
              <div className="space-y-2">
                {notesBullets.map((bullet, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <input
                      type="text"
                      value={bullet}
                      onChange={(e) => {
                        const next = [...notesBullets];
                        next[idx] = e.target.value;
                        onUpdateNotes({ notesBullets: next });
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNotes({ notesBullets: notesBullets.filter((_, i) => i !== idx) })
                      }
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Definitions Edit */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Core Definitions
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateNotes({
                      notesDefinitions: [...notesDefinitions, { term: '', definition: '' }],
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Definition
                </button>
              </div>
              <div className="space-y-3">
                {notesDefinitions.map((def, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Term"
                        value={def.term}
                        onChange={(e) => {
                          const next = [...notesDefinitions];
                          next[idx] = { ...next[idx], term: e.target.value };
                          onUpdateNotes({ notesDefinitions: next });
                        }}
                        className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateNotes({
                            notesDefinitions: notesDefinitions.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Definition"
                      value={def.definition}
                      onChange={(e) => {
                        const next = [...notesDefinitions];
                        next[idx] = { ...next[idx], definition: e.target.value };
                        onUpdateNotes({ notesDefinitions: next });
                      }}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Examples Edit */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Examples &amp; Applications
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateNotes({ notesExamples: [...notesExamples, ''] })}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Example
                </button>
              </div>
              <div className="space-y-2">
                {notesExamples.map((ex, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <textarea
                      rows={2}
                      value={ex}
                      onChange={(e) => {
                        const next = [...notesExamples];
                        next[idx] = e.target.value;
                        onUpdateNotes({ notesExamples: next });
                      }}
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNotes({ notesExamples: notesExamples.filter((_, i) => i !== idx) })
                      }
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Distraction-Free Read Mode */
          <div className="space-y-7 max-w-[70ch]">
            {notesSummary.trim() && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  Executive Summary
                </h3>
                <p className="text-[15px] leading-[1.68] text-slate-700 dark:text-slate-300">
                  {notesSummary}
                </p>
              </div>
            )}

            {notesBullets.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  Key Study Points
                </h3>
                <ul className="space-y-2.5">
                  {notesBullets.map((bullet, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-[15px] leading-[1.6] text-slate-700 dark:text-slate-300"
                    >
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shrink-0" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notesDefinitions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  Core Definitions
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {notesDefinitions.map((def, idx) => (
                    <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                      <dt className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {def.term}
                      </dt>
                      <dd className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 mt-1">
                        {def.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {notesExamples.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pb-1.5 border-b border-slate-200 dark:border-slate-800">
                  Examples &amp; Applications
                </h3>
                <ol className="space-y-2.5">
                  {notesExamples.map((example, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-3 text-[15px] leading-[1.6] text-slate-700 dark:text-slate-300"
                    >
                      <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400 mt-1 tabular-nums shrink-0">
                        0{idx + 1}.
                      </span>
                      <span>{example}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
