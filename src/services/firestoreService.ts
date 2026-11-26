import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  GeneratedNotesPayload,
  LectureRecord,
  SourceType,
  SubjectColor,
  SubjectRecord,
  WeekRecord,
} from '../types/study.ts';
import {
  ALLOWED_SUBJECT_COLORS,
  clampString,
  sanitizeBullets,
  sanitizeDefinitions,
  sanitizeExamples,
  sanitizeTags,
  sanitizeTranscript,
  VALIDATION_LIMITS,
} from '../utils/validation.ts';
import { db, handleFirestoreError, OperationType } from './firebaseClient.ts';

function makeDocId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${prefix}_${random}`;
}

export function subscribeSubjects(
  ownerId: string,
  onData: (subjects: SubjectRecord[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'subjects'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SubjectRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SubjectRecord, 'id'>),
      }));
      items.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'subjects');
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export function subscribeWeeks(
  ownerId: string,
  onData: (weeks: WeekRecord[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'weeks'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: WeekRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<WeekRecord, 'id'>),
      }));
      items.sort((a, b) => a.weekNumber - b.weekNumber);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'weeks');
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export function subscribeLectures(
  ownerId: string,
  onData: (lectures: LectureRecord[]) => void,
  onError: (err: Error) => void
) {
  const q = query(collection(db, 'lectures'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: LectureRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<LectureRecord, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'lectures');
      } catch (e) {
        onError(e as Error);
      }
    }
  );
}

export async function createSubjectWithWeeks(params: {
  ownerId: string;
  name: string;
  code: string;
  color: SubjectColor;
  weekCount?: number;
}): Promise<{ subjectId: string; firstWeekId: string }> {
  const subjectId = makeDocId('subj');
  const safeName = clampString(params.name, VALIDATION_LIMITS.SUBJECT_NAME_MAX) || 'Untitled Subject';
  const safeCode = clampString(params.code, VALIDATION_LIMITS.SUBJECT_CODE_MAX) || 'COURSE';
  const safeColor = ALLOWED_SUBJECT_COLORS.includes(params.color) ? params.color : 'blue';
  const totalWeeks = Math.max(1, Math.min(20, params.weekCount ?? 15));

  try {
    // Step 1: Create parent Subject first so Master Gate rules on Weeks pass cleanly
    await setDoc(doc(db, 'subjects', subjectId), {
      ownerId: params.ownerId,
      name: safeName,
      code: safeCode,
      color: safeColor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `subjects/${subjectId}`);
  }

  let firstWeekId = '';
  try {
    const batch = writeBatch(db);
    for (let w = 1; w <= totalWeeks; w++) {
      const weekId = makeDocId('wk');
      if (w === 1) firstWeekId = weekId;
      batch.set(doc(db, 'weeks', weekId), {
        ownerId: params.ownerId,
        subjectId,
        weekNumber: w,
        title: `Week ${w}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `weeks (batch for ${subjectId})`);
  }

  return { subjectId, firstWeekId };
}

export async function updateSubject(
  subjectId: string,
  updates: { name: string; code: string; color: SubjectColor }
): Promise<void> {
  const safeName = clampString(updates.name, VALIDATION_LIMITS.SUBJECT_NAME_MAX) || 'Untitled Subject';
  const safeCode = clampString(updates.code, VALIDATION_LIMITS.SUBJECT_CODE_MAX) || 'COURSE';
  const safeColor = ALLOWED_SUBJECT_COLORS.includes(updates.color) ? updates.color : 'blue';

  try {
    await updateDoc(doc(db, 'subjects', subjectId), {
      name: safeName,
      code: safeCode,
      color: safeColor,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `subjects/${subjectId}`);
  }
}

export async function deleteSubjectCascade(ownerId: string, subjectId: string): Promise<void> {
  try {
    const lecturesSnap = await getDocs(
      query(collection(db, 'lectures'), where('ownerId', '==', ownerId), where('subjectId', '==', subjectId))
    );
    const weeksSnap = await getDocs(
      query(collection(db, 'weeks'), where('ownerId', '==', ownerId), where('subjectId', '==', subjectId))
    );

    const docsToDelete = [...lecturesSnap.docs.map((d) => d.ref), ...weeksSnap.docs.map((d) => d.ref)];
    // Commit in chunks of 400 to stay well under Firestore 500-op batch limit
    for (let i = 0; i < docsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      docsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'subjects', subjectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `subjects/${subjectId}`);
  }
}

export async function createWeek(params: {
  ownerId: string;
  subjectId: string;
  weekNumber: number;
  title: string;
}): Promise<string> {
  const weekId = makeDocId('wk');
  const safeNumber = Math.max(
    VALIDATION_LIMITS.WEEK_MIN,
    Math.min(VALIDATION_LIMITS.WEEK_MAX, Math.round(params.weekNumber))
  );
  const safeTitle = clampString(params.title, VALIDATION_LIMITS.WEEK_TITLE_MAX) || `Week ${safeNumber}`;

  try {
    await setDoc(doc(db, 'weeks', weekId), {
      ownerId: params.ownerId,
      subjectId: params.subjectId,
      weekNumber: safeNumber,
      title: safeTitle,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `weeks/${weekId}`);
  }
  return weekId;
}

export async function updateWeek(
  weekId: string,
  updates: { weekNumber: number; title: string }
): Promise<void> {
  const safeNumber = Math.max(
    VALIDATION_LIMITS.WEEK_MIN,
    Math.min(VALIDATION_LIMITS.WEEK_MAX, Math.round(updates.weekNumber))
  );
  const safeTitle = clampString(updates.title, VALIDATION_LIMITS.WEEK_TITLE_MAX) || `Week ${safeNumber}`;

  try {
    await updateDoc(doc(db, 'weeks', weekId), {
      weekNumber: safeNumber,
      title: safeTitle,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `weeks/${weekId}`);
  }
}

export async function deleteWeekCascade(ownerId: string, weekId: string): Promise<void> {
  try {
    const lecturesSnap = await getDocs(
      query(collection(db, 'lectures'), where('ownerId', '==', ownerId), where('weekId', '==', weekId))
    );
    const batch = writeBatch(db);
    lecturesSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'weeks', weekId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `weeks/${weekId}`);
  }
}

export async function createLecture(params: {
  ownerId: string;
  subjectId: string;
  weekId: string;
  title: string;
  transcript?: string;
  sourceType?: SourceType;
  notes?: GeneratedNotesPayload;
  tags?: string[];
  revisionReady?: boolean;
}): Promise<string> {
  const lectureId = makeDocId('lec');
  const safeTitle = clampString(params.title, VALIDATION_LIMITS.LECTURE_TITLE_MAX) || 'Untitled Lecture';
  const safeTranscript = sanitizeTranscript(params.transcript || '');
  const safeSource: SourceType =
    params.sourceType === 'file' || params.sourceType === 'live' ? params.sourceType : 'paste';

  try {
    await setDoc(doc(db, 'lectures', lectureId), {
      ownerId: params.ownerId,
      subjectId: params.subjectId,
      weekId: params.weekId,
      title: safeTitle,
      transcript: safeTranscript,
      notesSummary: clampString(params.notes?.notesSummary || '', VALIDATION_LIMITS.SUMMARY_MAX),
      notesBullets: sanitizeBullets(params.notes?.notesBullets || []),
      notesDefinitions: sanitizeDefinitions(params.notes?.notesDefinitions || []),
      notesExamples: sanitizeExamples(params.notes?.notesExamples || []),
      tags: sanitizeTags(params.tags || []),
      revisionReady: Boolean(params.revisionReady),
      sourceType: safeSource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `lectures/${lectureId}`);
  }
  return lectureId;
}

export async function updateLectureContent(
  lectureId: string,
  updates: {
    title?: string;
    transcript?: string;
    sourceType?: SourceType;
    notesSummary?: string;
    notesBullets?: string[];
    notesDefinitions?: { term: string; definition: string }[];
    notesExamples?: string[];
    tags?: string[];
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.title !== undefined) {
    payload.title = clampString(updates.title, VALIDATION_LIMITS.LECTURE_TITLE_MAX) || 'Untitled Lecture';
  }
  if (updates.transcript !== undefined) {
    payload.transcript = sanitizeTranscript(updates.transcript);
  }
  if (updates.sourceType !== undefined) {
    payload.sourceType = updates.sourceType;
  }
  if (updates.notesSummary !== undefined) {
    payload.notesSummary = clampString(updates.notesSummary, VALIDATION_LIMITS.SUMMARY_MAX);
  }
  if (updates.notesBullets !== undefined) {
    payload.notesBullets = sanitizeBullets(updates.notesBullets);
  }
  if (updates.notesDefinitions !== undefined) {
    payload.notesDefinitions = sanitizeDefinitions(updates.notesDefinitions);
  }
  if (updates.notesExamples !== undefined) {
    payload.notesExamples = sanitizeExamples(updates.notesExamples);
  }
  if (updates.tags !== undefined) {
    payload.tags = sanitizeTags(updates.tags);
  }

  try {
    await updateDoc(doc(db, 'lectures', lectureId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `lectures/${lectureId}`);
  }
}

export async function toggleLectureRevisionReady(lectureId: string, revisionReady: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'lectures', lectureId), {
      revisionReady,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `lectures/${lectureId}`);
  }
}

export async function updateLectureTags(lectureId: string, tags: string[]): Promise<void> {
  try {
    await updateDoc(doc(db, 'lectures', lectureId), {
      tags: sanitizeTags(tags),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `lectures/${lectureId}`);
  }
}

export async function deleteLecture(lectureId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'lectures', lectureId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `lectures/${lectureId}`);
  }
}

const STARTER_SUBJECTS: Array<{ name: string; code: string; color: SubjectColor }> = [
  { name: 'Data Structures & Algorithms', code: 'CS 201', color: 'blue' },
  { name: 'Machine Learning Foundations', code: 'CS 340', color: 'violet' },
  { name: 'Operating Systems', code: 'CS 310', color: 'emerald' },
  { name: 'Linear Algebra', code: 'MATH 220', color: 'amber' },
  { name: 'Macroeconomics', code: 'ECON 102', color: 'cyan' },
  { name: 'Cognitive Psychology', code: 'PSYC 215', color: 'rose' },
];

const SAMPLE_TRANSCRIPT = `Welcome to Week 1 of Data Structures and Algorithms. Today we are establishing the core vocabulary of algorithm analysis: asymptotic notation, time complexity, and space complexity.

When we measure how fast an algorithm runs, counting raw wall-clock seconds is unreliable because CPU speed, compiler flags, and background load vary from machine to machine. Instead, we count elementary operations as a function of input size n.

Let us define Big-O notation formally. We say a function f(n) is O(g(n)) if there exist positive constants c and n0 such that for all n >= n0, f(n) <= c * g(n). Intuitively, Big-O gives us an asymptotic upper bound on growth rate—the worst-case ceiling as n scales toward infinity.

For example, searching an unsorted array of n items requires checking elements one by one. In the worst case, the target is at the very end or absent, taking n comparisons, which is O(n) linear time. In contrast, binary search on a sorted array halves the search space on each comparison. After k steps, the remaining subarray has size n / (2^k). Setting n / (2^k) = 1 yields k = log2(n), giving O(log n) logarithmic time. Notice how dramatic this difference is: for 1,000,000 items, linear search takes up to 1,000,000 checks, while binary search takes at most 20.

We also distinguish Big-Omega, which represents an asymptotic lower bound (best-case guarantee), and Big-Theta, which represents a tight bound when both upper and lower bounds match. Finally, remember amortized analysis: an operation like appending to a dynamic array occasionally triggers an O(n) resize, yet doubling capacity each time spreads that cost so the average cost per insertion over a sequence of operations remains O(1).`;

export async function seedStarterCurriculumIfNeeded(ownerId: string): Promise<void> {
  const existing = await getDocs(query(collection(db, 'subjects'), where('ownerId', '==', ownerId)));
  if (!existing.empty) return;

  let firstSubjectId = '';
  let firstWeekId = '';

  for (let i = 0; i < STARTER_SUBJECTS.length; i++) {
    const subj = STARTER_SUBJECTS[i];
    const created = await createSubjectWithWeeks({
      ownerId,
      name: subj.name,
      code: subj.code,
      color: subj.color,
      weekCount: 15,
    });
    if (i === 0) {
      firstSubjectId = created.subjectId;
      firstWeekId = created.firstWeekId;
    }
  }

  if (firstSubjectId && firstWeekId) {
    await createLecture({
      ownerId,
      subjectId: firstSubjectId,
      weekId: firstWeekId,
      title: 'Lecture 1: Asymptotic Notation & Algorithm Complexity',
      transcript: SAMPLE_TRANSCRIPT,
      sourceType: 'paste',
      tags: ['Important', 'Definition', 'Exam Focus'],
      revisionReady: true,
      notes: {
        notesSummary:
          'Algorithm analysis measures growth in elementary operations relative to input size n rather than hardware-dependent wall-clock time. Big-O provides an asymptotic upper bound, Big-Omega gives a lower bound, and Big-Theta defines a tight bound. Understanding how halving search spaces yields O(log n) scaling and how dynamic resizing achieves O(1) amortized cost is foundational for designing scalable software.',
        notesBullets: [
          'Asymptotic analysis abstracts away CPU speed and OS noise by counting operations as a function of input size n.',
          'Big-O notation O(g(n)) establishes an upper bound: f(n) <= c * g(n) for all n >= n0.',
          'Big-Omega denotes a lower bound, while Big-Theta denotes a tight bound matching both upper and lower growth.',
          'Binary search halves the remaining input on each step, reducing 1,000,000 checks down to at most 20 comparisons.',
          'Amortized analysis averages occasional expensive O(n) operations over frequent O(1) operations.',
        ],
        notesDefinitions: [
          {
            term: 'Big-O Notation O(g(n))',
            definition:
              'Asymptotic upper bound where f(n) <= c * g(n) for positive constants c and n0 and all n >= n0.',
          },
          {
            term: 'Big-Theta Notation',
            definition: 'Asymptotic tight bound when f(n) is bounded both above and below by g(n).',
          },
          {
            term: 'Amortized O(1) Complexity',
            definition:
              'Average time per operation over a worst-case sequence when occasional costly resizes are spread across cheap steps.',
          },
        ],
        notesExamples: [
          'Linear search on an unsorted array of 1,000,000 items takes up to 1,000,000 comparisons (O(n)).',
          'Binary search on a sorted array of 1,000,000 items takes at most 20 comparisons (O(log n)).',
          'Dynamic array append doubles capacity on overflow, yielding O(1) amortized insertion cost.',
        ],
      },
    });
  }
}
