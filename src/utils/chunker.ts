/**
 * Splits text into chunks of a target size with a specified overlap.
 */
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  if (!text) return [];
  
  // Clean up whitespace
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  const chunks: string[] = [];
  let index = 0;

  while (index < cleanText.length) {
    let end = index + chunkSize;
    
    // Adjust end to avoid splitting words in half if possible
    if (end < cleanText.length) {
      const nextChar = cleanText[end];
      if (nextChar !== ' ') {
        const lastSpace = cleanText.lastIndexOf(' ', end);
        if (lastSpace > index) {
          end = lastSpace;
        }
      }
    }

    const chunk = cleanText.substring(index, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move index by chunkSize - overlap
    index = end - overlap;
    if (index >= cleanText.length || end >= cleanText.length) {
      break;
    }
    
    // Ensure index moves forward to avoid infinite loop
    if (index <= end - chunkSize) {
      index = end;
    }
  }

  return chunks;
}
