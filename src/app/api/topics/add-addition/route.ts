import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { extractTextFromBuffer } from '@/utils/parser';
import { chunkText } from '@/utils/chunker';
import { getEmbedding } from '@/utils/cloudflareAi';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { topicId, type, content, filePath } = await request.json();
    if (!topicId || !type) {
      return NextResponse.json({ error: 'Missing topicId or type' }, { status: 400 });
    }

    let additionText = content || '';

    // If it's an image, download from storage and run OCR
    if (type === 'image' && filePath) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('additions')
        .download(filePath);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download image: ${downloadError?.message || 'Empty file'}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      additionText = await extractTextFromBuffer(buffer, fileData.type, filePath.split('/').pop() || 'photo.png');
    }

    if (!additionText.trim()) {
      return NextResponse.json({ error: 'No text content provided or extracted.' }, { status: 400 });
    }

    // Insert Addition record
    const { data: addition, error: insertError } = await supabase
      .from('additions')
      .insert({
        topic_id: topicId,
        user_id: user.id,
        type,
        content: additionText,
        file_path: filePath || null,
      })
      .select()
      .single();

    if (insertError || !addition) throw insertError || new Error('Failed to create addition record');

    // Chunk text
    const chunks = chunkText(additionText);

    // Save embeddings in chunks table
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);

      const { error: insertChunkError } = await supabase
        .from('chunks')
        .insert({
          addition_id: addition.id,
          topic_id: topicId,
          content: chunk,
          embedding,
        });

      if (insertChunkError) {
        console.error('Failed to insert addition chunk:', insertChunkError);
      }
    }

    return NextResponse.json({
      success: true,
      addition,
    });
  } catch (error: any) {
    console.error('Add addition error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
