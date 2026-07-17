import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getEmbedding, generateText } from '@/utils/cloudflareAi';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topicId, message } = await request.json();
    if (!topicId || !message) {
      return NextResponse.json({ error: 'Missing topicId or message' }, { status: 400 });
    }

    // 1. Generate query embedding
    const queryEmbedding = await getEmbedding(message);

    // 2. Query similar chunks using pgvector match_chunks RPC
    const { data: matchedChunks, error: rpcError } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.25,
      match_count: 5,
      p_topic_id: topicId,
    });

    if (rpcError) {
      console.error('Vector search RPC error:', rpcError);
    }

    // 3. Fetch structured note for this topic
    const { data: note } = await supabase
      .from('notes')
      .select('*')
      .eq('topic_id', topicId)
      .single();

    // 4. Fetch additions for this topic
    const { data: additions } = await supabase
      .from('additions')
      .select('content, type')
      .eq('topic_id', topicId);

    // 5. Build grounded context
    let context = '';

    if (matchedChunks && matchedChunks.length > 0) {
      context += "--- RELEVANT COURSE MATERIAL FRAGMENTS ---\n";
      matchedChunks.forEach((chunk: any, i: number) => {
        context += `Fragment ${i + 1}:\n${chunk.content}\n\n`;
      });
    }

    if (note) {
      context += "--- STRUCTURED STUDY NOTE FOR THIS TOPIC ---\n";
      context += `Core Idea: ${note.core_idea}\n`;
      context += `Definitions: ${JSON.stringify(note.key_definitions)}\n`;
      context += `Process & Logic: ${note.process_logic}\n`;
      if (note.formula) context += `Formula/Code: ${note.formula}\n`;
      context += `Exam Angles: ${note.exam_angles}\n\n`;
    }

    if (additions && additions.length > 0) {
      context += "--- USER ADDITIONS AND CUSTOM NOTES ---\n";
      additions.forEach((add: any, i: number) => {
        context += `Addition ${i + 1} (${add.type}):\n${add.content}\n\n`;
      });
    }

    const systemPrompt = `You are Cortex, a helpful academic study assistant. Your goal is to explain and teach the concepts requested by the student.
Use the provided context (relevant course materials, notes, and user additions) as your primary source of truth.
1. If the answer is found in the context, answer directly and clearly using the context.
2. If the context is empty, incomplete, or does not contain the answer to the user's question, use your general academic knowledge to provide a helpful, accurate, and comprehensive answer. When you do this, append a brief note at the end of your response in square brackets (e.g. "[Note: This explanation is based on general academic knowledge as it wasn't found in your uploaded materials]").
3. Keep your answers concise, clear, and direct. Use bullet points, code blocks, or markdown tables when explaining terms or processes.

CRITICAL DIRECTIVE: UPDATE STUDY NOTE ON REQUEST
- If the student explicitly or implicitly requests you to change, correct, edit, or update the generated study note (e.g. "change the definition of X in the note", "correct the wording of the note", "update the formula to Y", "add Z to the exam angles"), you must make those changes and output the fully updated note JSON.
- To do this, output the updated study note inside a markdown code block labeled "update-note-json" (i.e. \`\`\`update-note-json ... \`\`\`).
- Only output the \`\`\`update-note-json block if the student asked to update, modify, correct, or edit the note. If it's just a general question or teaching request, do NOT output it.
- Your updated JSON note must adhere to this exact schema:
{
  "core_idea": "A 1-2 sentence high-level summary of the main concept.",
  "key_definitions": [
    { "term": "Name of Term", "definition": "Direct, recall-friendly explanation of the term." }
  ],
  "process_logic": "Step-by-step logic, stages, workflow, or architectural layers of the concept, written in clean markdown list format.",
  "formula": "Relevant mathematical equations, formulas, or syntax blocks, or null if none apply.",
  "exam_angles": "Common exam questions, key trap points, and advice on how to structure answers to get maximum marks."
}

FORMULAS & MATH SYMBOLS INSTRUCTION:
- Any mathematical equations, formulas, physical laws, or chemical reactions in your explanations or note updates MUST be written in proper LaTeX notation.
  - NEVER use plain text slashes "/" for division or carets "^" for superscripts without LaTeX. Always use proper LaTeX structures:
    - Use "\\frac{numerator}{denominator}" for all fractions and divisions (e.g. use "\\frac{a}{b}" instead of "a/b").
    - Use "^{exponent}" for all superscripts and exponents (e.g. use "(1 + r)^{-n}" instead of "(1+r)^(-n)").
    - Use "_{subscript}" for subscripts.
  - Wrap any plain text words or variable names inside equations in "\\text{...}" so they are formatted as readable words rather than italicized individual math variables (e.g. use "\\text{Rent}" instead of "Rent", and "\\text{Value}" instead of "Value").
  - DO NOT use unescaped backslashes before plain words (e.g. never write "\\value" or "\\Rent" as they are invalid LaTeX commands that will break rendering).
  - Use "$ ... $" for inline math inside text fields.
  - Use "$$ ... $$" for block math equations inside text fields.`;

    const userPrompt = `Context details:
${context || 'No study materials or notes exist for this topic yet.'}

Question:
${message}`;

    // 6. Generate answer using Cloudflare AI
    const answer = await generateText(systemPrompt, userPrompt);

    // 7. Parse note update if present
    let updatedNote = null;
    let cleanAnswer = answer;
    const jsonBlockRegex = /```update-note-json\s*([\s\S]*?)\s*```/;
    const match = answer.match(jsonBlockRegex);

    if (match) {
      const jsonStr = match[1].trim();
      try {
        const noteJson = JSON.parse(jsonStr);
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

        if (upsertError) {
          console.error('Failed to upsert updated note from chat:', upsertError);
        } else {
          updatedNote = savedNote;
        }
      } catch (jsonErr) {
        console.error('Failed to parse update-note-json from assistant response:', jsonErr);
      }

      // Strip the raw JSON block from the chat reply so the user doesn't see it in the bubble
      cleanAnswer = answer.replace(jsonBlockRegex, '').trim();
      if (!cleanAnswer) {
        cleanAnswer = "I have successfully updated the study note with your requested changes.";
      }
    }

    // 8. Save user message to database
    await supabase.from('chat_messages').insert({
      topic_id: topicId,
      user_id: user.id,
      role: 'user',
      content: message,
    });

    // Save assistant message to database
    const { data: savedMsg, error: insertMsgError } = await supabase
      .from('chat_messages')
      .insert({
        topic_id: topicId,
        user_id: user.id,
        role: 'assistant',
        content: cleanAnswer,
      })
      .select()
      .single();

    if (insertMsgError) throw insertMsgError;

    return NextResponse.json({
      success: true,
      message: savedMsg,
      updatedNote,
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
