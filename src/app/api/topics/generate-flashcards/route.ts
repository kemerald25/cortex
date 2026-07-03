import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateJson } from '@/utils/cloudflareAi';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topicId } = await request.json();
    if (!topicId) {
      return NextResponse.json({ error: 'Missing topicId' }, { status: 400 });
    }

    // Fetch the note for this topic
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('topic_id', topicId)
      .single();

    if (noteError || !note) {
      return NextResponse.json({ error: 'Structured note not found. Please generate a note first.' }, { status: 400 });
    }

    const systemPrompt = `You are Cortex, an expert active-recall flashcard creator. Your task is to generate a set of 5 to 10 flashcards based on the study note provided.
Focus each card on a single critical detail: a term definition, a step in a process, a formula, or an exam trap.
Design questions to prompt active recall (e.g., "What are the 3 main parts of X?" or "Explain the difference between Y and Z in the context of W"), not simple yes/no.
Keep answers concise and clear so the student can easily check their accuracy.

Your response MUST be a JSON array of objects. Do not write any markdown code block formatting. Return only the JSON.

Expected Format:
[
  {
    "question": "What is the primary objective of a Relational Database Management System (RDBMS)?",
    "answer": "To store, manage, and retrieve data in tables linked by relations (keys) while preserving ACID integrity."
  },
  ...
]`;

    const userPrompt = `Here is the study note:
Core Idea: ${note.core_idea}
Definitions: ${JSON.stringify(note.key_definitions)}
Process/Logic: ${note.process_logic}
Formula: ${note.formula || 'None'}
Exam Angles: ${note.exam_angles}

Generate the active-recall flashcards.`;

    const cardsJson = await generateJson(systemPrompt, userPrompt);

    if (!Array.isArray(cardsJson)) {
      throw new Error('AI did not return a valid list of flashcards');
    }

    // Delete existing AI-generated flashcards for this topic (keeping manually added ones)
    const { error: deleteCardsError } = await supabase
      .from('flashcards')
      .delete()
      .eq('topic_id', topicId)
      .eq('source', 'ai');

    if (deleteCardsError) {
      console.error('Failed to delete old flashcards:', deleteCardsError);
    }

    // Insert flashcards into database
    const cardsToInsert = cardsJson.map((card: any) => ({
      topic_id: topicId,
      question: card.question,
      answer: card.answer,
      ease_factor: 2.5,
      interval: 0,
      repetitions: 0,
      next_review_date: new Date().toISOString(),
      source: 'ai',
    }));

    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcards')
      .insert(cardsToInsert)
      .select();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      flashcardsCount: insertedCards.length,
      flashcards: insertedCards,
    });
  } catch (error: any) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
