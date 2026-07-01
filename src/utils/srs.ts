/**
 * SuperMemo-2 (SM-2) algorithm implementation for Spaced Repetition scheduling.
 * @param quality Score from 0 to 5:
 *   5 - perfect response
 *   4 - correct response after a hesitation
 *   3 - correct response recalled with serious difficulty
 *   2 - incorrect response; where the correct one seemed easy to recall
 *   1 - incorrect response; the correct one remembered
 *   0 - complete blackout
 */
export function calculateSM2(
  quality: number,
  repetitions: number,
  interval: number,
  easeFactor: number
) {
  let nextRepetitions = repetitions;
  let nextInterval = interval;
  let nextEaseFactor = easeFactor;

  // Ensure quality is between 0 and 5
  const q = Math.max(0, Math.min(5, quality));

  if (q >= 3) {
    if (repetitions === 0) {
      nextInterval = 1;
    } else if (repetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(interval * easeFactor);
    }
    nextRepetitions = repetitions + 1;
  } else {
    nextRepetitions = 0;
    nextInterval = 1;
  }

  // Adjust Ease Factor
  nextEaseFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  
  // Ease factor cannot fall below 1.3
  if (nextEaseFactor < 1.3) {
    nextEaseFactor = 1.3;
  }

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + nextInterval);

  return {
    repetitions: nextRepetitions,
    interval: nextInterval,
    ease_factor: parseFloat(nextEaseFactor.toFixed(2)),
    next_review_date: nextReviewDate.toISOString(),
  };
}
