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
      .select('title, description, course_id')
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

    let sourceText = chunks && chunks.length > 0
      ? chunks.map((c: any) => c.content).join('\n\n')
      : '';

    // Fallback: If no chunks are linked directly to this topic_id,
    // fetch all chunks for the materials of this course and dynamically search/use them.
    if (!sourceText.trim() && topic.course_id) {
      const { data: materials } = await supabase
        .from('materials')
        .select('id')
        .eq('course_id', topic.course_id);

      if (materials && materials.length > 0) {
        const materialIds = materials.map((m: any) => m.id);
        const { data: courseChunks } = await supabase
          .from('chunks')
          .select('content')
          .in('material_id', materialIds)
          .limit(30);

        if (courseChunks && courseChunks.length > 0) {
          // Attempt to filter chunks that mention topic keywords (words > 3 characters)
          const keywords = topic.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
          const matchedChunks = courseChunks.filter((c: any) => {
            const contentLower = c.content.toLowerCase();
            return keywords.some((kw: string) => contentLower.includes(kw));
          });

          // Use matched chunks if found; otherwise, fall back to the first 15 chunks of the course
          const selectedChunks = matchedChunks.length > 0 ? matchedChunks : courseChunks.slice(0, 15);
          sourceText = selectedChunks.map((c: any) => c.content).join('\n\n');
        }
      }
    }

    if (!sourceText.trim()) {
      return NextResponse.json({ error: 'No course materials found linked to this topic. Please extract and confirm topics first.' }, { status: 400 });
    }

    const systemPrompt = `You are Cortex, an expert academic planner and note writer. Your goal is to write a highly structured, exam-oriented study Note for the topic: "${topic.title}".
Write this note for a student who needs to recall and reproduce these concepts in an exam hall. Keep it extremely concise, focused, and high-impact. Do not include passive filler text.

CRITICAL: Your response MUST be a valid JSON object matching the schema below.
- Both "process_logic" and "exam_angles" are STRICTLY MANDATORY. Under no circumstances should they be empty or null. If the source material does not explicitly define a step-by-step process or exam angles, you MUST synthesize and write them based on academic best practices for this topic.
- "key_definitions" MUST contain between 3 to 5 items. Do NOT list more than 5 key terms.
- "process_logic" and "exam_angles" MUST be single strings (wrapped in double quotes).
- Inside these strings, format the content as markdown lists (e.g. using "1. Item" or "- Item").
- Do NOT output "process_logic" or "exam_angles" as JSON arrays (i.e. do NOT use [ ] brackets for them).

FORMULAS & MATH SYMBOLS INSTRUCTION:
- Any mathematical equations, formulas, physical laws, or chemical reactions MUST be written in LaTeX notation.
  - Use "$ ... $" for inline math (e.g. "$E = mc^2$").
  - Use "$$ ... $$" for block math equations.
  - The "formula" field MUST contain the primary formula/equation/syntax block (written in LaTeX or code notation, without surrounding "$$"), or null if none apply.
  - Never write formulas as plain text (like "x/y"); always use LaTeX notation (like "$\frac{x}{y}$") for a professional mathematical look.

Schema:
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
${sourceText.substring(0, 18000)}
---
Generate the structured Note.`;

    const noteJson = await generateJson(systemPrompt, userPrompt);
    console.log('AI noteJson parsed result:', JSON.stringify(noteJson, null, 2));

    // Normalize potential type variations (e.g. if the LLM returned process_logic or exam_angles as arrays instead of strings)
    let processLogic = noteJson.process_logic || noteJson.process || noteJson.logic || noteJson.workflow || '';
    if (Array.isArray(processLogic)) {
      processLogic = processLogic.join('\n');
    } else if (typeof processLogic !== 'string') {
      processLogic = JSON.stringify(processLogic);
    }

    let examAngles = noteJson.exam_angles || noteJson.exam_questions || noteJson.exam_angles_advice || noteJson.exam_angle || '';
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
      }, {
        onConflict: 'topic_id'
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
