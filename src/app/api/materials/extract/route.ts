import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { extractTextFromBuffer } from '@/utils/parser';
import { chunkText } from '@/utils/chunker';
import { getEmbedding } from '@/utils/cloudflareAi';

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    // Check auth session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { materialId } = await request.json();
    if (!materialId) {
      return NextResponse.json({ error: 'Missing materialId' }, { status: 450 });
    }

    // Fetch material metadata
    const { data: material, error: fetchError } = await supabase
      .from('materials')
      .select('*')
      .eq('id', materialId)
      .single();

    if (fetchError || !material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    // Update status to extracting
    await supabase
      .from('materials')
      .update({ status: 'extracting' })
      .eq('id', materialId);

    // Download file from storage
    if (!material.file_path) {
      throw new Error('File path is missing on material record.');
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('materials')
      .download(material.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'Empty file'}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Guess content type or fetch from fileData
    const mimeType = fileData.type || '';
    
    // Extract text
    const extractedText = await extractTextFromBuffer(buffer, mimeType, material.name);

    if (!extractedText) {
      throw new Error('No text content could be extracted from this material.');
    }

    // Update extracted_text in database
    const { error: updateError } = await supabase
      .from('materials')
      .update({
        extracted_text: extractedText,
        status: 'completed',
      })
      .eq('id', materialId);

    if (updateError) throw updateError;

    // Chunk text
    const chunks = chunkText(extractedText);
    
    // Generate embeddings and save to chunks table
    // Perform sequentially or in small batches to avoid rate limits
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk);
      
      const { error: insertChunkError } = await supabase
        .from('chunks')
        .insert({
          material_id: materialId,
          content: chunk,
          embedding: embedding,
        });

      if (insertChunkError) {
        console.error('Failed to insert chunk:', insertChunkError);
      }
    }

    return NextResponse.json({
      success: true,
      chunksCount: chunks.length,
    });
  } catch (error: any) {
    console.error('Extraction API error:', error);
    
    // Attempt to mark material as failed
    try {
      const { materialId } = await request.clone().json();
      if (materialId) {
        await supabase
          .from('materials')
          .update({ status: 'failed' })
          .eq('id', materialId);
      }
    } catch (_) {}

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
