import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateJson } from '@/utils/cloudflareAi';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check auth session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseId } = await request.json();
    if (!courseId) {
      return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
    }

    // Fetch materials for the course
    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('id, name')
      .eq('course_id', courseId)
      .eq('status', 'completed');

    if (materialsError) throw materialsError;

    if (!materials || materials.length === 0) {
      return NextResponse.json({ error: 'No processed materials found for this course.' }, { status: 400 });
    }

    // Fetch chunks of each completed material
    let sourceText = '';
    for (const material of materials) {
      const { data: chunks, error: chunksError } = await supabase
        .from('chunks')
        .select('content')
        .eq('material_id', material.id)
        .order('created_at', { ascending: true }); // Retrieve all chunks chronologically

      if (chunksError) continue;

      if (chunks && chunks.length > 0) {
        // Systematic sampling if the document is very long (> 100 chunks)
        // This ensures the AI gets a representative overview of the whole document (start, middle, and end)
        let selectedChunks = chunks;
        if (chunks.length > 100) {
          const step = chunks.length / 100;
          selectedChunks = [];
          for (let i = 0; i < 100; i++) {
            const idx = Math.floor(i * step);
            if (chunks[idx]) {
              selectedChunks.push(chunks[idx]);
            }
          }
        }
        sourceText += `\n--- MATERIAL: ${material.name} ---\n`;
        sourceText += selectedChunks.map((c: any) => c.content).join('\n');
      }
    }

    if (!sourceText.trim()) {
      return NextResponse.json({ error: 'No text chunks available to generate topics.' }, { status: 400 });
    }

    const systemPrompt = `You are Cortex, an AI academic assistant. Your task is to analyze the text extracts from a student's course materials and propose a cohesive, structured Table of Contents (a list of key topics). 
Create between 5 to 10 distinct, clear topics that cover the course material logical progression.
Ensure the topics are focused on active recall.
Your response MUST be a JSON array of objects. Do not write any preamble, explanation, or postscript. Return only the JSON.

Expected Format:
[
  {
    "title": "Introduction to Database Systems",
    "description": "Fundamental concepts, history of databases, DBMS architecture, and relational vs. non-relational storage."
  },
  ...
]`;

    const userPrompt = `Here is the course material excerpt:\n${sourceText.substring(0, 100000)}`; // limit size to ~100k chars for safety and model limits

    const proposedTopics = await generateJson(systemPrompt, userPrompt);

    if (!Array.isArray(proposedTopics)) {
      throw new Error('AI did not return a valid list of topics');
    }

    return NextResponse.json({
      success: true,
      topics: proposedTopics,
    });
  } catch (error: any) {
    console.error('Topic extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
