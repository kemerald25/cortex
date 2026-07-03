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

    // Fetch topic information
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('title, description')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    }

    // Fetch chunks associated with this topic
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('content')
      .eq('topic_id', topicId)
      .limit(25); // pull enough context but stay safe on token limits

    if (chunksError) throw chunksError;

    const sourceText = chunks && chunks.length > 0
      ? chunks.map(c => c.content).join('\n\n')
      : '';

    if (!sourceText.trim()) {
      return NextResponse.json({ error: 'No course materials found linked to this topic. Please extract and confirm topics first.' }, { status: 400 });
    }

    const systemPrompt = `You are Cortex, an expert academic planner and note writer. Your goal is to write a highly structured, exam-oriented study Note for the topic: "${topic.title}".
Write this note for a student who needs to recall and reproduce these concepts in an exam hall. Keep it extremely concise, focused, and high-impact. Do not include passive filler text.
Your response MUST be a JSON object with the following schema:
{
  "core_idea": "A 1-2 sentence high-level summary of the main concept.",
  "key_definitions": [
    { "term": "Name of Term", "definition": "Direct, recall-friendly explanation of the term." }
  ],
  "process_logic": "Step-by-step logic, stages, workflow, or architectural layers of the concept, written in clean markdown list format.",
  "formula": "Relevant mathematical equations, formulas, or syntax blocks, or null if none apply.",
  "exam_angles": "Common exam questions, key trap points, and advice on how to structure answers to get maximum marks."
}`;

    const userPrompt = `Topic: ${topic.title} - ${topic.description}

Here is the source material text for this topic:
---
${sourceText.substring(0, 35000)}
---
Generate the structured Note.`;

    const noteJson = await generateJson(systemPrompt, userPrompt);

    // Normalize potential type variations (e.g. if the LLM returned process_logic or exam_angles as arrays instead of strings)
    let processLogic = noteJson.process_logic || '';
    if (Array.isArray(processLogic)) {
      processLogic = processLogic.join('\n');
    } else if (typeof processLogic !== 'string') {
      processLogic = JSON.stringify(processLogic);
    }

    let examAngles = noteJson.exam_angles || '';
    if (Array.isArray(examAngles)) {
      examAngles = examAngles.join('\n');
    } else if (typeof examAngles !== 'string') {
      examAngles = JSON.stringify(examAngles);
    }

    let keyDefinitions = noteJson.key_definitions || [];
    if (typeof keyDefinitions === 'string') {
      try {
        keyDefinitions = JSON.parse(keyDefinitions);
      } catch (_) {
        keyDefinitions = [];
      }
    }
    if (!Array.isArray(keyDefinitions)) {
      keyDefinitions = [];
    }

    // Save/Upsert the note in the database
    const { data: savedNote, error: upsertError } = await supabase
      .from('notes')
      .upsert({
        topic_id: topicId,
        core_idea: noteJson.core_idea || '',
        key_definitions: keyDefinitions,
        process_logic: processLogic,
        formula: noteJson.formula || null,
        exam_angles: examAngles,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (upsertError) throw upsertError;

    return NextResponse.json({
      success: true,
      note: savedNote,
    });
  } catch (error: any) {
    console.error('Note generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
