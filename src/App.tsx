import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { BookMarked, FileText, Loader2, Plus } from 'lucide-react';
import { NotesPanel } from './components/NotesPanel.tsx';
import { SidebarTree } from './components/SidebarTree.tsx';
import { TopBar } from './components/TopBar.tsx';
import { TranscriptPanel } from './components/TranscriptPanel.tsx';
import { generateStudyNotesStream, type GenerationProgress } from './services/apiClient.ts';
import { auth, googleProvider } from './services/firebaseClient.ts';
import {
  createLecture,
  createSubjectWithWeeks,
  createWeek,
  deleteLecture,
  deleteSubjectCascade,
  deleteWeekCascade,
  seedStarterCurriculumIfNeeded,
  subscribeLectures,
  subscribeSubjects,
  subscribeWeeks,
  toggleLectureRevisionReady,
  updateLectureContent,
  updateLectureTags,
  updateSubject,
  updateWeek,
} from './services/firestoreService.ts';
import type {
  LectureRecord,
  NoteDefinition,
  SourceType,
  SubjectColor,
  SubjectRecord,
  WeekRecord,
} from './types/study.ts';

interface LectureDraft {
  lectureId: string;
  title: string;
  transcript: string;
  sourceType: SourceType;
  notesSummary: string;
  notesBullets: string[];
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
  tags: string[];
  revisionReady: boolean;
}

export default function App() {
  // Theme state synced with <html class="dark">
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('lectern-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      window.localStorage.setItem('lectern-theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('lectern-theme', 'light');
    }
  }, [isDark]);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Firestore synced collections
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [weeks, setWeeks] = useState<WeekRecord[]>([]);
  const [lectures, setLectures] = useState<LectureRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [syncError, setSyncError] = useState<Error | null>(null);

  // Selection & navigation state
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyRevisionReady, setOnlyRevisionReady] = useState(false);

  // Draft & auto-save state
  const [draft, setDraft] = useState<LectureDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<{ lectureId: string; updates: Partial<LectureDraft> } | null>(null);

  // Gemini generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Propagate Firestore listener errors to ErrorBoundary
  if (syncError) {
    throw syncError;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setSubjects([]);
      setWeeks([]);
      setLectures([]);
      setSelectedSubjectId(null);
      setSelectedWeekId(null);
      setSelectedLectureId(null);
      setDraft(null);
      return;
    }

    setDataLoading(true);
    let seededOnce = false;

    const unsubSubjects = subscribeSubjects(
      user.uid,
      (rows) => {
        setSubjects(rows);
        setDataLoading(false);
        if (rows.length === 0 && !seededOnce) {
          seededOnce = true;
          void seedStarterCurriculumIfNeeded(user.uid).catch((err) => {
            setSyncError(err instanceof Error ? err : new Error(String(err)));
          });
        }
      },
      (err) => setSyncError(err)
    );

    const unsubWeeks = subscribeWeeks(
      user.uid,
      (rows) => setWeeks(rows),
      (err) => setSyncError(err)
    );

    const unsubLectures = subscribeLectures(
      user.uid,
      (rows) => setLectures(rows),
      (err) => setSyncError(err)
    );

    return () => {
      unsubSubjects();
      unsubWeeks();
      unsubLectures();
    };
  }, [authReady, user]);

  // Keep active selection coherent as data arrives
  useEffect(() => {
    if (subjects.length === 0) return;

    if (!selectedSubjectId || !subjects.some((s) => s.id === selectedSubjectId)) {
      const firstLecture = lectures[0];
      if (firstLecture) {
        setSelectedSubjectId(firstLecture.subjectId);
        setSelectedWeekId(firstLecture.weekId);
        setSelectedLectureId(firstLecture.id);
      } else {
        const firstSubj = subjects[0];
        setSelectedSubjectId(firstSubj.id);
        const firstWk = weeks.find((w) => w.subjectId === firstSubj.id);
        setSelectedWeekId(firstWk?.id || null);
      }
    }
  }, [subjects, weeks, lectures, selectedSubjectId]);

  const activeLecture = useMemo(
    () => lectures.find((l) => l.id === selectedLectureId) || null,
    [lectures, selectedLectureId]
  );

  const activeSubject = useMemo(
    () => subjects.find((s) => s.id === (activeLecture?.subjectId || selectedSubjectId)) || undefined,
    [subjects, activeLecture, selectedSubjectId]
  );

  const activeWeek = useMemo(
    () => weeks.find((w) => w.id === (activeLecture?.weekId || selectedWeekId)) || undefined,
    [weeks, activeLecture, selectedWeekId]
  );

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingUpdatesRef.current;
    if (!pending) return;
    pendingUpdatesRef.current = null;
    setSaveStatus('saving');
    try {
      await updateLectureContent(pending.lectureId, pending.updates);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, []);

  // Load lecture into local draft only when switching to a different lecture ID
  useEffect(() => {
    if (!activeLecture) {
      setDraft(null);
      return;
    }
    if (draft?.lectureId !== activeLecture.id) {
      setDraft({
        lectureId: activeLecture.id,
        title: activeLecture.title,
        transcript: activeLecture.transcript,
        sourceType: activeLecture.sourceType,
        notesSummary: activeLecture.notesSummary,
        notesBullets: activeLecture.notesBullets,
        notesDefinitions: activeLecture.notesDefinitions,
        notesExamples: activeLecture.notesExamples,
        tags: activeLecture.tags,
        revisionReady: activeLecture.revisionReady,
      });
      setGenerationError(null);
      setSaveStatus('idle');
    }
  }, [activeLecture, draft?.lectureId]);

  const scheduleAutoSave = useCallback(
    (lectureId: string, partial: Partial<LectureDraft>) => {
      const existingPending = pendingUpdatesRef.current;
      const mergedUpdates =
        existingPending && existingPending.lectureId === lectureId
          ? { ...existingPending.updates, ...partial }
          : partial;

      pendingUpdatesRef.current = { lectureId, updates: mergedUpdates };
      setSaveStatus('saving');

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        void flushPendingSave();
      }, 800);
    },
    [flushPendingSave]
  );

  const handleSelectLecture = async (lecture: LectureRecord) => {
    await flushPendingSave();
    setSelectedSubjectId(lecture.subjectId);
    setSelectedWeekId(lecture.weekId);
    setSelectedLectureId(lecture.id);
    setMobileSidebarOpen(false);
  };

  const handleSelectSubject = async (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    const subjWeeks = weeks.filter((w) => w.subjectId === subjectId);
    if (subjWeeks.length > 0 && !subjWeeks.some((w) => w.id === selectedWeekId)) {
      const firstWk = subjWeeks[0];
      setSelectedWeekId(firstWk.id);
      const firstLec = lectures.find((l) => l.weekId === firstWk.id);
      if (firstLec) {
        await flushPendingSave();
        setSelectedLectureId(firstLec.id);
      }
    }
  };

  const handleSelectWeek = async (week: WeekRecord) => {
    setSelectedSubjectId(week.subjectId);
    setSelectedWeekId(week.id);
    const firstLec = lectures.find((l) => l.weekId === week.id);
    await flushPendingSave();
    setSelectedLectureId(firstLec?.id || null);
  };

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    }
  };

  const handleSignOut = async () => {
    await flushPendingSave();
    await signOut(auth);
  };

  const handleCreateSubject = async (data: {
    name: string;
    code: string;
    color: SubjectColor;
    weekCount: number;
  }) => {
    if (!user) return;
    const { subjectId, firstWeekId } = await createSubjectWithWeeks({
      ownerId: user.uid,
      ...data,
    });
    setSelectedSubjectId(subjectId);
    setSelectedWeekId(firstWeekId);
    setSelectedLectureId(null);
  };

  const handleCreateLecture = async (subjectId: string, weekId: string) => {
    if (!user) return;
    await flushPendingSave();
    const existingCount = lectures.filter((l) => l.weekId === weekId).length;
    const lectureId = await createLecture({
      ownerId: user.uid,
      subjectId,
      weekId,
      title: `Lecture ${existingCount + 1}`,
    });
    setSelectedSubjectId(subjectId);
    setSelectedWeekId(weekId);
    setSelectedLectureId(lectureId);
    setMobileSidebarOpen(false);
  };

  const handleDeleteLecture = async (lectureId: string) => {
    if (selectedLectureId === lectureId) {
      pendingUpdatesRef.current = null;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSelectedLectureId(null);
      setDraft(null);
    }
    await deleteLecture(lectureId);
  };

  const handleGenerateNotes = async () => {
    if (!draft) return;
    await flushPendingSave();
    setGenerationError(null);
    setIsGenerating(true);
    setGenerationProgress({ stage: 'starting', message: 'Preparing lecture transcript...' });

    try {
      const result = await generateStudyNotesStream(
        {
          transcript: draft.transcript,
          subjectName: activeSubject?.name || 'Academic Course',
          weekNumber: activeWeek?.weekNumber || 1,
          lectureTitle: draft.title || 'Untitled Lecture',
        },
        (progress) => setGenerationProgress(progress)
      );

      const mergedTags =
        draft.tags.length > 0 ? draft.tags : result.notes.suggestedTags || [];

      const updatedNotes = {
        notesSummary: result.notes.notesSummary,
        notesBullets: result.notes.notesBullets,
        notesDefinitions: result.notes.notesDefinitions,
        notesExamples: result.notes.notesExamples,
        tags: mergedTags,
      };

      setDraft((prev) => (prev ? { ...prev, ...updatedNotes } : prev));
      setSaveStatus('saving');
      await updateLectureContent(draft.lectureId, {
        title: draft.title,
        transcript: draft.transcript,
        sourceType: draft.sourceType,
        ...updatedNotes,
      });
      setSaveStatus('saved');
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Failed to generate study notes.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleToggleTag = (tag: string) => {
    if (!draft) return;
    const exists = draft.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
    const nextTags = exists
      ? draft.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...draft.tags, tag].slice(0, 10);

    setDraft({ ...draft, tags: nextTags });
    setSaveStatus('saving');
    void updateLectureTags(draft.lectureId, nextTags)
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));
  };

  const handleToggleRevisionReady = () => {
    if (!draft) return;
    const nextReady = !draft.revisionReady;
    setDraft({ ...draft, revisionReady: nextReady });
    setSaveStatus('saving');
    void toggleLectureRevisionReady(draft.lectureId, nextReady)
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        user={user}
        searchQuery={searchQuery}
        onlyRevisionReady={onlyRevisionReady}
        isDark={isDark}
        onSearchChange={setSearchQuery}
        onToggleRevisionFilter={() => setOnlyRevisionReady((prev) => !prev)}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        onSignIn={() => void handleSignIn()}
        onSignOut={() => void handleSignOut()}
      />

      {!authReady ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      ) : !user ? (
        /* Clean Sign-In Screen */
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 space-y-6">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <BookMarked className="w-5 h-5" />
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                Turn lecture transcripts into structured, revision-ready study notes
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Organize courses across 15 academic weeks, upload .txt, .pdf, or .docx transcripts,
                synthesize concise summaries and definitions with Gemini Flash, and export clean
                PDFs.
              </p>
            </div>

            {authError && (
              <div className="px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4">
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                Sign in with Google
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Your subjects, transcripts, and notes sync automatically to Firestore.
              </span>
            </div>
          </div>
        </main>
      ) : (
        /* Main 3-Panel Study Workspace */
        <div className="flex-1 flex relative">
          {/* Mobile Backdrop */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <div
            className={`${
              mobileSidebarOpen ? 'fixed inset-y-[57px] left-0 z-40 w-[276px]' : 'hidden lg:block'
            }`}
          >
            <SidebarTree
              subjects={subjects}
              weeks={weeks}
              lectures={lectures}
              selectedSubjectId={activeSubject?.id || selectedSubjectId}
              selectedWeekId={activeWeek?.id || selectedWeekId}
              selectedLectureId={selectedLectureId}
              searchQuery={searchQuery}
              onlyRevisionReady={onlyRevisionReady}
              onSelectLecture={(lec) => void handleSelectLecture(lec)}
              onSelectSubject={(id) => void handleSelectSubject(id)}
              onSelectWeek={(wk) => void handleSelectWeek(wk)}
              onCreateSubject={handleCreateSubject}
              onUpdateSubject={updateSubject}
              onDeleteSubject={async (subjId) => {
                if (!user) return;
                await deleteSubjectCascade(user.uid, subjId);
              }}
              onCreateWeek={async (subjectId, weekNumber, title) => {
                if (!user) return;
                const wkId = await createWeek({ ownerId: user.uid, subjectId, weekNumber, title });
                setSelectedWeekId(wkId);
              }}
              onUpdateWeek={async (weekId, weekNumber, title) => {
                await updateWeek(weekId, { weekNumber, title });
              }}
              onDeleteWeek={async (weekId) => {
                if (!user) return;
                await deleteWeekCascade(user.uid, weekId);
              }}
              onCreateLecture={handleCreateLecture}
              onDeleteLecture={handleDeleteLecture}
            />
          </div>

          {/* Main Workspace Area */}
          <main className="flex-1 min-w-0 p-4 lg:p-6 flex flex-col gap-4 lg:h-[calc(100vh-57px)] lg:overflow-y-auto">
            {dataLoading && subjects.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  Loading your study curriculum...
                </div>
              </div>
            ) : (
              <>
                {/* Contextual Breadcrumb */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {activeSubject ? `${activeSubject.code} · ${activeSubject.name}` : 'Select a subject'}
                    </span>
                    {activeWeek && (
                      <>
                        <span aria-hidden="true">/</span>
                        <span className="tabular-nums truncate">
                          Week {activeWeek.weekNumber}
                          {activeWeek.title !== `Week ${activeWeek.weekNumber}`
                            ? `: ${activeWeek.title}`
                            : ''}
                        </span>
                      </>
                    )}
                    {draft && (
                      <>
                        <span aria-hidden="true">/</span>
                        <span className="text-slate-900 dark:text-slate-100 font-medium truncate">
                          {draft.title || 'Untitled Lecture'}
                        </span>
                      </>
                    )}
                  </div>

                  {activeSubject && activeWeek && (
                    <button
                      type="button"
                      onClick={() => void handleCreateLecture(activeSubject.id, activeWeek.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Lecture in Week {activeWeek.weekNumber}
                    </button>
                  )}
                </div>

                {draft && activeLecture ? (
                  <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch min-h-0">
                    <TranscriptPanel
                      lecture={activeLecture}
                      title={draft.title}
                      transcript={draft.transcript}
                      sourceType={draft.sourceType}
                      isGenerating={isGenerating}
                      generationProgress={generationProgress}
                      generationError={generationError}
                      hasExistingNotes={
                        draft.notesSummary.trim().length > 0 || draft.notesBullets.length > 0
                      }
                      onChangeTitle={(nextTitle) => {
                        setDraft((prev) => (prev ? { ...prev, title: nextTitle } : prev));
                        scheduleAutoSave(draft.lectureId, { title: nextTitle });
                      }}
                      onChangeTranscript={(nextTranscript, source) => {
                        setDraft((prev) =>
                          prev ? { ...prev, transcript: nextTranscript, sourceType: source } : prev
                        );
                        scheduleAutoSave(draft.lectureId, {
                          transcript: nextTranscript,
                          sourceType: source,
                        });
                      }}
                      onGenerateNotes={handleGenerateNotes}
                    />

                    <NotesPanel
                      subject={activeSubject}
                      week={activeWeek}
                      lectureTitle={draft.title}
                      notesSummary={draft.notesSummary}
                      notesBullets={draft.notesBullets}
                      notesDefinitions={draft.notesDefinitions}
                      notesExamples={draft.notesExamples}
                      tags={draft.tags}
                      revisionReady={draft.revisionReady}
                      isGenerating={isGenerating}
                      saveStatus={saveStatus}
                      onUpdateNotes={(updates) => {
                        setDraft((prev) => (prev ? { ...prev, ...updates } : prev));
                        scheduleAutoSave(draft.lectureId, updates);
                      }}
                      onToggleTag={handleToggleTag}
                      onToggleRevisionReady={handleToggleRevisionReady}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
                    <div className="max-w-sm space-y-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {activeWeek
                          ? `No lectures in Week ${activeWeek.weekNumber} yet`
                          : 'Select a week to start'}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Create a lecture to paste a transcript, upload a .txt/.pdf/.docx file, and
                        generate structured study notes.
                      </p>
                      {activeSubject && activeWeek && (
                        <button
                          type="button"
                          onClick={() => void handleCreateLecture(activeSubject.id, activeWeek.id)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Create First Lecture
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
