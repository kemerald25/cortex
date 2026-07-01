'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { calculateSM2 } from '@/utils/srs';
import { Brain, RotateCw, CheckCircle, Flame, Layers } from 'lucide-react';

export default function StudyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [dueCards, setDueCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCompletedCount, setSessionCompletedCount] = useState(0);

  async function loadDueCards() {
    setLoading(true);
    // Fetch flashcards where next_review_date <= now()
    // Inner join on topics and courses to show metadata
    const { data, error } = await supabase
      .from('flashcards')
      .select('*, topics!inner(title, course_id, courses!inner(name, code))')
      .lte('next_review_date', new Date().toISOString())
      .order('next_review_date', { ascending: true });

    if (!error && data) {
      setDueCards(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDueCards();
  }, []);

  const handleReviewRating = async (qualityScore: number) => {
    const currentCard = dueCards[currentIndex];
    if (!currentCard) return;

    // Calculate new metrics
    const updatedMetrics = calculateSM2(
      qualityScore,
      currentCard.repetitions || 0,
      currentCard.interval || 0,
      currentCard.ease_factor || 2.5
    );

    // Save to database
    const { error } = await supabase
      .from('flashcards')
      .update({
        ease_factor: updatedMetrics.ease_factor,
        interval: updatedMetrics.interval,
        repetitions: updatedMetrics.repetitions,
        next_review_date: updatedMetrics.next_review_date,
      })
      .eq('id', currentCard.id);

    if (error) {
      console.error('Failed to update flashcard review schedule:', error);
    }

    // Increment completed in session
    setSessionCompletedCount(prev => prev + 1);

    // Move to next card
    setIsFlipped(false);
    
    // Remove the reviewed card from the active queue or move index
    setTimeout(() => {
      const updatedQueue = dueCards.filter((_, i) => i !== currentIndex);
      setDueCards(updatedQueue);

      // Adjust index if needed
      if (currentIndex >= updatedQueue.length && updatedQueue.length > 0) {
        setCurrentIndex(0);
      }
    }, 150);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 mt-4 text-sm font-medium">Loading Study Queue...</p>
      </div>
    );
  }

  const currentCard = dueCards[currentIndex];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            Review Queue
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
            Spaced Study
          </h1>
        </div>
        
        {sessionCompletedCount > 0 && (
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1.5 rounded-full text-xs font-bold">
            <Flame className="w-4 h-4 fill-amber-500" />
            <span>+{sessionCompletedCount} Reviewed</span>
          </div>
        )}
      </div>

      {dueCards.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-900 rounded-3xl text-center space-y-5 py-12">
          <div className="p-4 bg-emerald-500/10 rounded-2xl w-fit mx-auto border border-emerald-500/25 text-emerald-450">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-white text-base">You're all caught up!</h3>
            <p className="text-xs text-slate-400 max-w-[260px] mx-auto leading-relaxed">
              No flashcards are due for review. You can create more cards in the Courses tab or review individual topic decks.
            </p>
          </div>
          <button
            onClick={() => router.push('/courses')}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/10"
          >
            Go to Courses
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metadata */}
          <div className="space-y-1.5 bg-slate-900/30 p-3.5 rounded-2xl border border-slate-900">
            <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase">
              <span className="text-indigo-400">
                {currentCard?.topics?.courses?.code} — {currentCard?.topics?.courses?.name}
              </span>
              <span className="text-slate-500">
                {dueCards.length} Cards Left
              </span>
            </div>
            <h2 className="text-xs font-bold text-white truncate">
              Topic: {currentCard?.topics?.title}
            </h2>
          </div>

          {/* Interactive Card */}
          <div className="flex flex-col items-center gap-4">
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="w-full min-h-[220px] bg-slate-900/40 border border-slate-850 hover:border-slate-800 rounded-3xl p-6 flex flex-col justify-between cursor-pointer transition-all relative select-none shadow-lg active:scale-[0.99]"
            >
              <div className="flex-1 flex flex-col justify-center items-center text-center">
                {!isFlipped ? (
                  <p className="text-white font-semibold text-sm leading-relaxed max-w-[280px]">
                    {currentCard?.question}
                  </p>
                ) : (
                  <p className="text-slate-350 text-xs leading-relaxed max-w-[280px] whitespace-pre-line">
                    {currentCard?.answer}
                  </p>
                )}
              </div>

              <div className="text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider flex justify-center items-center gap-1.5 mt-4">
                <RotateCw className="w-3 h-3" />
                <span>Tap to {isFlipped ? 'see question' : 'flip & reveal answer'}</span>
              </div>
            </div>

            {/* Self Evaluation */}
            {isFlipped ? (
              <div className="w-full space-y-2.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                  How well did you recall this card?
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => handleReviewRating(1)}
                    className="py-3 px-1 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 rounded-xl text-[10px] font-bold text-rose-450 transition-all text-center"
                  >
                    Again
                  </button>
                  <button
                    onClick={() => handleReviewRating(3)}
                    className="py-3 px-1 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-900/40 rounded-xl text-[10px] font-bold text-amber-450 transition-all text-center"
                  >
                    Hard
                  </button>
                  <button
                    onClick={() => handleReviewRating(4)}
                    className="py-3 px-1 bg-indigo-950/30 hover:bg-indigo-900/50 border border-indigo-900/40 rounded-xl text-[10px] font-bold text-indigo-400 transition-all text-center"
                  >
                    Good
                  </button>
                  <button
                    onClick={() => handleReviewRating(5)}
                    className="py-3 px-1 bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-900/40 rounded-xl text-[10px] font-bold text-emerald-450 transition-all text-center"
                  >
                    Easy
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-[66px]"></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
