import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getEmbedding } from '@/utils/cloudflareAi';

// Simple dot product for normalized vectors (equivalent to cosine similarity)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseId, topics } = await request.json();
    if (!courseId || !Array.isArray(topics)) {
      return NextResponse.json({ error: 'Missing courseId or topics array' }, { status: 400 });
    }

    // 1. Delete existing topics for this course (so we can rewrite confirmed ones cleanly)
    const { error: deleteError } = await supabase
      .from('topics')
      .delete()
      .eq('course_id', courseId);

    if (deleteError) throw deleteError;

    // 2. Insert new confirmed topics
    const topicsToInsert = topics.map((t: any, index: number) => ({
      course_id: courseId,
      title: t.title,
      description: t.description || '',
      order_index: index,
      is_confirmed: true,
    }));

    const { data: insertedTopics, error: insertError } = await supabase
      .from('topics')
      .insert(topicsToInsert)
      .select();

    if (insertError || !insertedTopics) throw insertError || new Error('Failed to insert confirmed topics');

    // 3. Match chunks to the new topics semantically
    // First, fetch all completed materials for the course
    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('id')
      .eq('course_id', courseId);

    if (materialsError) throw materialsError;

    if (materials && materials.length > 0) {
      const materialIds = materials.map(m => m.id);

      // Fetch all chunks belonging to these materials
      const { data: chunks, error: chunksError } = await supabase
        .from('chunks')
        .select('id, content, embedding')
        .in('material_id', materialIds);

      if (chunksError) throw chunksError;

      if (chunks && chunks.length > 0) {
        // Generate embeddings for each topic title + description
        const topicEmbeddings = await Promise.all(
          insertedTopics.map(async (topic) => {
            const textToEmbed = `${topic.title}: ${topic.description}`;
            const embedding = await getEmbedding(textToEmbed);
            return {
              id: topic.id,
              embedding,
            };
          })
        );

        // For each chunk, find the topic with the highest similarity
        // We will perform updates in parallel or sequentially.
        const chunkUpdates = chunks.map((chunk) => {
          // Parse embedding if it's returned as a string (Supabase pgvector sometimes returns pgvector string format "[0.1,0.2,...]")
          let chunkVec: number[] = [];
          if (typeof chunk.embedding === 'string') {
            chunkVec = (chunk.embedding as string)
              .replace('[', '')
              .replace(']', '')
              .split(',')
              .map(Number);
          } else if (Array.isArray(chunk.embedding)) {
            chunkVec = chunk.embedding;
          }

          if (chunkVec.length === 0) return null;

          let bestTopicId = insertedTopics[0].id;
          let bestSimilarity = -1;

          for (const topicEmbed of topicEmbeddings) {
            const similarity = cosineSimilarity(chunkVec, topicEmbed.embedding);
            if (similarity > bestSimilarity) {
              bestSimilarity = similarity;
              bestTopicId = topicEmbed.id;
            }
          }

          return {
            id: chunk.id,
            topic_id: bestTopicId,
          };
        }).filter(Boolean) as { id: string; topic_id: string }[];

        // Perform updates in database
        // In a real system, we'd do a single upsert or batch query.
        // We can do it by grouping updates by topic_id and updating in chunks
        const updatesByTopic: Record<string, string[]> = {};
        for (const update of chunkUpdates) {
          if (!updatesByTopic[update.topic_id]) {
            updatesByTopic[update.topic_id] = [];
          }
          updatesByTopic[update.topic_id].push(update.id);
        }

        for (const [topicId, chunkIds] of Object.entries(updatesByTopic)) {
          const { error: updateError } = await supabase
            .from('chunks')
            .update({ topic_id: topicId })
            .in('id', chunkIds);

          if (updateError) {
            console.error(`Failed to assign chunks to topic ${topicId}:`, updateError);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      topicsCount: insertedTopics.length,
    });
  } catch (error: any) {
    console.error('Topic confirmation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
