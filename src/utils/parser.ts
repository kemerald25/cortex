import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

/**
 * Extracts text from a file buffer based on the mime type or file extension.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const cleanMime = mimeType.toLowerCase();
  const fileExt = fileName.split('.').pop()?.toLowerCase();

  try {
    if (cleanMime === 'application/pdf' || fileExt === 'pdf') {
      const data = await pdf(buffer);
      let text = data.text?.trim() || '';

      // Fallback: If pdf-parse returns almost no text, it might be a scanned PDF.
      // In a real production system we would extract images from the PDF and run OCR.
      // For this app, we will flag it or log it. If the text is empty, we will return a descriptive error
      // or placeholder indicating it requires OCR/scanned upload of individual pages.
      if (text.length < 50) {
        return `[Scanned PDF Detected] This PDF appears to be scanned or contains only images. Please upload individual page photos (PNG/JPG) for OCR extraction.`;
      }
      return text;
    }

    if (
      cleanMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileExt === 'docx'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value?.trim() || '';
    }

    if (
      cleanMime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(fileExt || '')
    ) {
      // Run OCR using Tesseract.js
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(buffer);
      await worker.terminate();
      return text?.trim() || '';
    }

    throw new Error(`Unsupported file type: ${mimeType} (${fileName})`);
  } catch (error: any) {
    console.error('Error during text extraction:', error);
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}
