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

FORMULAS & MATH SYMBOLS INSTRUCTION:
- Any mathematical equations, formulas, physical laws, or chemical reactions in your explanations MUST be written in LaTeX notation.
  - Use "$ ... $" for inline math (e.g. "$E = mc^2$").
  - Use "$$ ... $$" for block math equations.
  - Never write formulas as plain text (like "x/y"); always use LaTeX notation (like "$\\frac{x}{y}$") for a professional mathematical look.`;

    const userPrompt = `Context details:
${context || 'No study materials or notes exist for this topic yet.'}

Question:
${message}`;

    // 6. Generate answer using Cloudflare AI
    const answer = await generateText(systemPrompt, userPrompt);

    // 7. Save user message to database
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
        content: answer,
      })
      .select()
      .single();

    if (insertMsgError) throw insertMsgError;

    return NextResponse.json({
      success: true,
      message: savedMsg,
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
