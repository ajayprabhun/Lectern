import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Shuffle,
} from 'lucide-react';
import type { NoteDefinition } from '../types/study.ts';

interface FlashcardItem {
  id: string;
  kind: 'definition' | 'example';
  frontLabel: string;
  frontText: string;
  backLabel: string;
  backText: string;
}

interface FlashcardModeProps {
  lectureTitle: string;
  notesDefinitions: NoteDefinition[];
  notesExamples: string[];
  onSwitchToEdit?: () => void;
}

type DeckFilter = 'all' | 'definition' | 'example';

function buildExamplePrompt(example: string, index: number): { front: string; back: string } {
  const colonIdx = example.indexOf(':');
  if (colonIdx > 3 && colonIdx < 64) {
    const lead = example.slice(0, colonIdx).trim();
    const rest = example.slice(colonIdx + 1).trim();
    if (rest.length > 0) {
      return {
        front: lead,
        back: rest,
      };
    }
  }
  return {
    front: `Worked Example ${String(index + 1).padStart(2, '0')} — Recall the scenario and outcome`,
    back: example,
  };
}

export function FlashcardMode({
  lectureTitle,
  notesDefinitions,
  notesExamples,
  onSwitchToEdit,
}: FlashcardModeProps) {
  const [deckFilter, setDeckFilter] = useState<DeckFilter>('all');
  const [isFlipped, setIsFlipped] = useState(false);
  const [termFirst, setTermFirst] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [masteredIds, setMasteredIds] = useState<Record<string, boolean>>({});

  const rawCards = useMemo<FlashcardItem[]>(() => {
    const defCards: FlashcardItem[] = notesDefinitions.map((d, idx) => ({
      id: `def-${idx}-${d.term}`,
      kind: 'definition',
      frontLabel: 'Term',
      frontText: d.term,
      backLabel: 'Definition',
      backText: d.definition,
    }));

    const exCards: FlashcardItem[] = notesExamples.map((ex, idx) => {
      const { front, back } = buildExamplePrompt(ex, idx);
      return {
        id: `ex-${idx}-${ex.slice(0, 24)}`,
        kind: 'example',
        frontLabel: 'Example Prompt',
        frontText: front,
        backLabel: 'Example & Application',
        backText: back,
      };
    });

    return [...defCards, ...exCards];
  }, [notesDefinitions, notesExamples]);

  const filteredCards = useMemo(() => {
    const base =
      deckFilter === 'all' ? rawCards : rawCards.filter((c) => c.kind === deckFilter);

    if (shuffleSeed === 0) return base;

    // Deterministic Fisher-Yates shuffle keyed by shuffleSeed
    const copy = [...base];
    let seed = shuffleSeed;
    for (let i = copy.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const j = seed % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }, [rawCards, deckFilter, shuffleSeed]);

  // Reset card cursor when lecture or filter changes
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [lectureTitle, deckFilter, shuffleSeed]);

  // Clamp index if deck shrinks during edits
  useEffect(() => {
    if (filteredCards.length > 0 && currentIndex >= filteredCards.length) {
      setCurrentIndex(filteredCards.length - 1);
      setIsFlipped(false);
    }
  }, [filteredCards.length, currentIndex]);

  const activeCard = filteredCards[currentIndex] || null;

  const goToPrev = useCallback(() => {
    if (filteredCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + filteredCards.length) % filteredCards.length);
  }, [filteredCards.length]);

  const goToNext = useCallback(() => {
    if (filteredCards.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  }, [filteredCards.length]);

  const toggleFlip = useCallback(() => {
    if (!activeCard) return;
    setIsFlipped((prev) => !prev);
  }, [activeCard]);

  // Keyboard shortcuts for fast laptop study sessions (Left/Right/Space)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleFlip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, toggleFlip]);

  const masteredCount = useMemo(
    () => filteredCards.filter((c) => masteredIds[c.id]).length,
    [filteredCards, masteredIds]
  );

  if (rawCards.length === 0) {
    return (
      <div className="h-full min-h-[340px] flex flex-col items-center justify-center text-center px-6">
        <div className="max-w-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500 dark:text-slate-400">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No flashcards available yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Flashcards are built from this lecture&apos;s Core Definitions and Examples. Generate
            study notes from your transcript or add definitions manually to start a session.
          </p>
          {onSwitchToEdit && (
            <button
              type="button"
              onClick={onSwitchToEdit}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Add Definitions or Examples
            </button>
          )}
        </div>
      </div>
    );
  }

  const showFront = termFirst ? !isFlipped : isFlipped;
  const activeSideLabel = activeCard
    ? showFront
      ? activeCard.frontLabel
      : activeCard.backLabel
    : '';
  const activeSideText = activeCard
    ? showFront
      ? activeCard.frontText
      : activeCard.backText
    : '';

  const isCurrentMastered = activeCard ? Boolean(masteredIds[activeCard.id]) : false;

  return (
    <div data-section="flashcard-mode" className="flex flex-col h-full gap-5">
      {/* Deck Controls Row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Filter Segmented Control */}
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setDeckFilter('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              deckFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All ({rawCards.length})
          </button>
          <button
            type="button"
            disabled={notesDefinitions.length === 0}
            onClick={() => setDeckFilter('definition')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums disabled:opacity-40 ${
              deckFilter === 'definition'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Definitions ({notesDefinitions.length})
          </button>
          <button
            type="button"
            disabled={notesExamples.length === 0}
            onClick={() => setDeckFilter('example')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums disabled:opacity-40 ${
              deckFilter === 'example'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Examples ({notesExamples.length})
          </button>
        </div>

        {/* Deck Utilities */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setTermFirst((prev) => !prev);
              setIsFlipped(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {termFirst ? 'Term First' : 'Definition First'}
          </button>

          <button
            type="button"
            onClick={() => setShuffleSeed((prev) => (prev === 0 ? Date.now() % 100000 : prev + 1))}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              shuffleSeed > 0
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            Shuffle
          </button>

          {(shuffleSeed > 0 || masteredCount > 0 || currentIndex > 0) && (
            <button
              type="button"
              onClick={() => {
                setShuffleSeed(0);
                setMasteredIds({});
                setCurrentIndex(0);
                setIsFlipped(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            Card {filteredCards.length > 0 ? currentIndex + 1 : 0} of {filteredCards.length}
          </span>
          <span>
            {masteredCount} of {filteredCards.length} marked reviewed
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-200"
            style={{
              width:
                filteredCards.length > 0
                  ? `${Math.round(((currentIndex + 1) / filteredCards.length) * 100)}%`
                  : '0%',
            }}
          />
        </div>
      </div>

      {/* Interactive Deck Card */}
      {activeCard && (
        <button
          type="button"
          onClick={toggleFlip}
          aria-label={`Flashcard ${currentIndex + 1}. Showing ${activeSideLabel}. Click to flip.`}
          className={`group flex-1 min-h-[260px] w-full text-left rounded-xl border p-6 sm:p-8 flex flex-col justify-between transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isFlipped
              ? 'border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          {/* Card Kicker (Unboxed Metadata) */}
          <div className="flex items-center justify-between gap-3 w-full text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {activeCard.kind === 'definition' ? 'Core Definition' : 'Example'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeSideLabel}</span>
            </div>
            {isCurrentMastered && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reviewed
              </span>
            )}
          </div>

          {/* Card Content */}
          <div className="my-auto py-6">
            <p
              className={
                showFront
                  ? 'font-display text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 leading-snug text-balance'
                  : 'text-base sm:text-[17px] leading-relaxed text-slate-800 dark:text-slate-200'
              }
            >
              {activeSideText}
            </p>
          </div>

          {/* Card Prompt Footer */}
          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 w-full pt-3 border-t border-slate-200/70 dark:border-slate-800/80">
            <span>
              Click card or press Space to show {showFront ? 'answer' : 'prompt'}
            </span>
            <span className="font-mono tabular-nums">
              {showFront ? 'Front' : 'Back'}
            </span>
          </div>
        </button>
      )}

      {/* Navigation & Study Action Footer */}
      {activeCard && (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filteredCards.length <= 1}
              onClick={goToPrev}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <button
              type="button"
              onClick={toggleFlip}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              {isFlipped ? 'Show Front' : 'Reveal Answer'}
            </button>

            <button
              type="button"
              disabled={filteredCards.length <= 1}
              onClick={goToNext}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextVal = !isCurrentMastered;
              setMasteredIds((prev) => ({
                ...prev,
                [activeCard.id]: nextVal,
              }));
              if (nextVal && filteredCards.length > 1) {
                goToNext();
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              isCurrentMastered
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {isCurrentMastered ? 'Reviewed' : 'Got It'}
          </button>
        </div>
      )}
    </div>
  );
}
