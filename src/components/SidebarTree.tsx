import { useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { LectureRecord, SubjectColor, SubjectRecord, WeekRecord } from '../types/study.ts';
import { ALLOWED_SUBJECT_COLORS } from '../utils/validation.ts';

interface SidebarTreeProps {
  subjects: SubjectRecord[];
  weeks: WeekRecord[];
  lectures: LectureRecord[];
  selectedSubjectId: string | null;
  selectedWeekId: string | null;
  selectedLectureId: string | null;
  searchQuery: string;
  onlyRevisionReady: boolean;
  onSelectLecture: (lecture: LectureRecord) => void;
  onSelectSubject: (subjectId: string) => void;
  onSelectWeek: (week: WeekRecord) => void;
  onCreateSubject: (data: { name: string; code: string; color: SubjectColor; weekCount: number }) => Promise<void>;
  onUpdateSubject: (subjectId: string, data: { name: string; code: string; color: SubjectColor }) => Promise<void>;
  onDeleteSubject: (subjectId: string) => Promise<void>;
  onCreateWeek: (subjectId: string, weekNumber: number, title: string) => Promise<void>;
  onUpdateWeek: (weekId: string, weekNumber: number, title: string) => Promise<void>;
  onDeleteWeek: (weekId: string) => Promise<void>;
  onCreateLecture: (subjectId: string, weekId: string) => Promise<void>;
  onDeleteLecture: (lectureId: string) => Promise<void>;
}

const COLOR_SWATCH: Record<SubjectColor, string> = {
  blue: 'bg-blue-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
  violet: 'bg-violet-600',
  cyan: 'bg-cyan-600',
};

export function SidebarTree({
  subjects,
  weeks,
  lectures,
  selectedSubjectId,
  selectedWeekId,
  selectedLectureId,
  searchQuery,
  onlyRevisionReady,
  onSelectLecture,
  onSelectSubject,
  onSelectWeek,
  onCreateSubject,
  onUpdateSubject,
  onDeleteSubject,
  onCreateWeek,
  onUpdateWeek,
  onDeleteWeek,
  onCreateLecture,
  onDeleteLecture,
}: SidebarTreeProps) {
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

  // Subject add/edit modal state
  const [subjectModal, setSubjectModal] = useState<{
    mode: 'create' | 'edit';
    subjectId?: string;
    name: string;
    code: string;
    color: SubjectColor;
    weekCount: number;
  } | null>(null);

  // Week add/edit modal state
  const [weekModal, setWeekModal] = useState<{
    mode: 'create' | 'edit';
    subjectId: string;
    weekId?: string;
    weekNumber: number;
    title: string;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const isSubjectExpanded = (subjectId: string) =>
    expandedSubjects[subjectId] !== undefined
      ? expandedSubjects[subjectId]
      : subjectId === selectedSubjectId;

  const isWeekExpanded = (weekId: string) =>
    expandedWeeks[weekId] !== undefined ? expandedWeeks[weekId] : weekId === selectedWeekId;

  const toggleSubject = (subjectId: string) => {
    const next = !isSubjectExpanded(subjectId);
    setExpandedSubjects((prev) => ({ ...prev, [subjectId]: next }));
    onSelectSubject(subjectId);
  };

  const toggleWeek = (week: WeekRecord) => {
    const next = !isWeekExpanded(week.id);
    setExpandedWeeks((prev) => ({ ...prev, [week.id]: next }));
    onSelectWeek(week);
  };

  // Filtered view when searching or filtering Revision Ready
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0 || onlyRevisionReady;

  const filteredLectures = isFiltering
    ? lectures.filter((lec) => {
        if (onlyRevisionReady && !lec.revisionReady) return false;
        if (!normalizedQuery) return true;
        const subject = subjects.find((s) => s.id === lec.subjectId);
        const week = weeks.find((w) => w.id === lec.weekId);
        const haystack = [
          lec.title,
          lec.notesSummary,
          lec.transcript,
          ...lec.notesBullets,
          ...lec.notesDefinitions.map((d) => `${d.term} ${d.definition}`),
          ...lec.notesExamples,
          ...lec.tags,
          subject?.name || '',
          subject?.code || '',
          week?.title || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : [];

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectModal || !subjectModal.name.trim()) return;
    setBusyId('subject-modal');
    try {
      if (subjectModal.mode === 'create') {
        await onCreateSubject({
          name: subjectModal.name.trim(),
          code: subjectModal.code.trim() || 'SUBJ',
          color: subjectModal.color,
          weekCount: subjectModal.weekCount,
        });
      } else if (subjectModal.subjectId) {
        await onUpdateSubject(subjectModal.subjectId, {
          name: subjectModal.name.trim(),
          code: subjectModal.code.trim() || 'SUBJ',
          color: subjectModal.color,
        });
      }
      setSubjectModal(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveWeek = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weekModal) return;
    setBusyId('week-modal');
    try {
      if (weekModal.mode === 'create') {
        await onCreateWeek(
          weekModal.subjectId,
          weekModal.weekNumber,
          weekModal.title.trim() || `Week ${weekModal.weekNumber}`
        );
      } else if (weekModal.weekId) {
        await onUpdateWeek(
          weekModal.weekId,
          weekModal.weekNumber,
          weekModal.title.trim() || `Week ${weekModal.weekNumber}`
        );
      }
      setWeekModal(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <aside
      data-section="sidebar-navigation"
      className="w-full lg:w-[276px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col lg:h-[calc(100vh-57px)] overflow-hidden"
    >
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {isFiltering ? 'Matching Notes' : 'Curriculum'}
          </span>
        </div>
        {!isFiltering && (
          <button
            type="button"
            onClick={() =>
              setSubjectModal({
                mode: 'create',
                name: '',
                code: '',
                color: 'blue',
                weekCount: 15,
              })
            }
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Subject
          </button>
        )}
      </div>

      {/* Tree or Search Results */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1">
        {isFiltering ? (
          filteredLectures.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matching notes</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Try another keyword or clear the active filter.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 pb-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredLectures.length} {filteredLectures.length === 1 ? 'lecture' : 'lectures'} found
              </div>
              {filteredLectures.map((lec) => {
                const subj = subjects.find((s) => s.id === lec.subjectId);
                const wk = weeks.find((w) => w.id === lec.weekId);
                const active = lec.id === selectedLectureId;
                return (
                  <button
                    key={lec.id}
                    type="button"
                    onClick={() => onSelectLecture(lec)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${
                      active
                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                        : 'border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                        {subj?.code || 'Course'} · Week {wk?.weekNumber ?? '—'}
                      </span>
                      {lec.revisionReady && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate mt-0.5">
                      {lec.title}
                    </p>
                  </button>
                );
              })}
            </div>
          )
        ) : subjects.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No subjects yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Add your first subject to generate 15 study weeks.
            </p>
          </div>
        ) : (
          subjects.map((subject) => {
            const expanded = isSubjectExpanded(subject.id);
            const subjectWeeks = weeks.filter((w) => w.subjectId === subject.id);
            const subjectLectureCount = lectures.filter((l) => l.subjectId === subject.id).length;

            return (
              <div key={subject.id} className="space-y-0.5">
                {/* Subject Row */}
                <div
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
                    subject.id === selectedSubjectId
                      ? 'bg-slate-100 dark:bg-slate-800/80'
                      : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject.id)}
                    className="flex-1 flex items-center gap-2 min-w-0 text-left py-0.5"
                  >
                    {expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className={`w-2 h-2 rounded-sm shrink-0 ${COLOR_SWATCH[subject.color] || 'bg-blue-600'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {subject.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                        {subject.code} · {subjectWeeks.length}w · {subjectLectureCount} notes
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <button
                      type="button"
                      title="Edit subject"
                      onClick={() =>
                        setSubjectModal({
                          mode: 'edit',
                          subjectId: subject.id,
                          name: subject.name,
                          code: subject.code,
                          color: subject.color,
                          weekCount: subjectWeeks.length || 15,
                        })
                      }
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      title="Delete subject"
                      onClick={() => void onDeleteSubject(subject.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Weeks inside Subject */}
                {expanded && (
                  <div className="pl-4 ml-2 border-l border-slate-200 dark:border-slate-800 space-y-0.5 py-0.5">
                    {subjectWeeks.map((week) => {
                      const wkExpanded = isWeekExpanded(week.id);
                      const weekLectures = lectures.filter((l) => l.weekId === week.id);

                      return (
                        <div key={week.id} className="space-y-0.5">
                          <div
                            className={`group flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                              week.id === selectedWeekId
                                ? 'bg-slate-100/90 dark:bg-slate-800/60'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleWeek(week)}
                              className="flex-1 flex items-center gap-1.5 min-w-0 text-left py-0.5"
                            >
                              {wkExpanded ? (
                                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                              <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate tabular-nums">
                                {week.title === `Week ${week.weekNumber}`
                                  ? `Week ${week.weekNumber}`
                                  : `W${week.weekNumber} · ${week.title}`}
                              </span>
                              {weekLectures.length > 0 && (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums ml-auto">
                                  {weekLectures.length}
                                </span>
                              )}
                            </button>

                            <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                title="Add lecture to this week"
                                onClick={() => {
                                  setExpandedWeeks((prev) => ({ ...prev, [week.id]: true }));
                                  void onCreateLecture(subject.id, week.id);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="Rename week"
                                onClick={() =>
                                  setWeekModal({
                                    mode: 'edit',
                                    subjectId: subject.id,
                                    weekId: week.id,
                                    weekNumber: week.weekNumber,
                                    title: week.title,
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                title="Delete week"
                                onClick={() => void onDeleteWeek(week.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Lectures inside Week */}
                          {wkExpanded && (
                            <div className="pl-4 ml-2 border-l border-slate-200 dark:border-slate-800 space-y-0.5 py-0.5">
                              {weekLectures.map((lec) => {
                                const active = lec.id === selectedLectureId;
                                return (
                                  <div
                                    key={lec.id}
                                    className={`group flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                                      active
                                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => onSelectLecture(lec)}
                                      className="flex-1 flex items-center gap-1.5 min-w-0 text-left py-0.5"
                                    >
                                      <FileText className="w-3 h-3 shrink-0 opacity-75" />
                                      <span className="text-xs truncate">{lec.title}</span>
                                    </button>
                                    {lec.revisionReady && (
                                      <CheckCircle2
                                        aria-label="Revision Ready"
                                        className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      title="Delete lecture"
                                      onClick={() => void onDeleteLecture(lec.id)}
                                      className="p-0.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              })}

                              <button
                                type="button"
                                onClick={() => void onCreateLecture(subject.id, week.id)}
                                className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                New Lecture
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        const nextNum =
                          subjectWeeks.length > 0
                            ? Math.max(...subjectWeeks.map((w) => w.weekNumber)) + 1
                            : 1;
                        setWeekModal({
                          mode: 'create',
                          subjectId: subject.id,
                          weekNumber: Math.min(52, nextNum),
                          title: `Week ${Math.min(52, nextNum)}`,
                        });
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add Week
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Subject Create/Edit Modal */}
      {subjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(e) => void handleSaveSubject(e)}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {subjectModal.mode === 'create' ? 'Add Subject' : 'Edit Subject'}
              </h3>
              <button
                type="button"
                onClick={() => setSubjectModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={subjectModal.name}
                  onChange={(e) => setSubjectModal({ ...subjectModal, name: e.target.value })}
                  placeholder="e.g., Distributed Systems"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Course Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    value={subjectModal.code}
                    onChange={(e) => setSubjectModal({ ...subjectModal, code: e.target.value })}
                    placeholder="e.g., CS 410"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {subjectModal.mode === 'create' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Initial Weeks
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={subjectModal.weekCount}
                      onChange={(e) =>
                        setSubjectModal({ ...subjectModal, weekCount: Number(e.target.value) || 15 })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Color Indicator
                </label>
                <div className="flex items-center gap-2">
                  {ALLOWED_SUBJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSubjectModal({ ...subjectModal, color: c })}
                      aria-label={`Select ${c}`}
                      className={`w-6 h-6 rounded-md ${COLOR_SWATCH[c]} transition-transform ${
                        subjectModal.color === c
                          ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-110'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSubjectModal(null)}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === 'subject-modal'}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busyId === 'subject-modal'
                  ? 'Saving...'
                  : subjectModal.mode === 'create'
                  ? 'Create Subject'
                  : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Week Create/Edit Modal */}
      {weekModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={(e) => void handleSaveWeek(e)}
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {weekModal.mode === 'create' ? 'Add Week' : 'Edit Week'}
              </h3>
              <button
                type="button"
                onClick={() => setWeekModal(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Week Number
                </label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  required
                  value={weekModal.weekNumber}
                  onChange={(e) => setWeekModal({ ...weekModal, weekNumber: Number(e.target.value) || 1 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Week Title
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={weekModal.title}
                  onChange={(e) => setWeekModal({ ...weekModal, title: e.target.value })}
                  placeholder="e.g., Consensus & Raft"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWeekModal(null)}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === 'week-modal'}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busyId === 'week-modal' ? 'Saving...' : 'Save Week'}
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
}
