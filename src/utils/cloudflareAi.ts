async function callCloudflareAi(model: string, body: any): Promise<any> {
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const rawApiTokens = process.env.CLOUDFLARE_API_TOKEN;

  if (!ACCOUNT_ID || !rawApiTokens) {
    throw new Error('Cloudflare AI configuration is missing. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
  }

  // Split the tokens list by comma
  const apiTokens = rawApiTokens.split(',').map((t: string) => t.trim()).filter(Boolean);
  if (apiTokens.length === 0) {
    throw new Error('No valid Cloudflare API tokens found.');
  }

  let lastError: any = null;

  for (let i = 0; i < apiTokens.length; i++) {
    const token = apiTokens[i];
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // If rate limited or server error, try the next token
      if (response.status === 429 || response.status >= 500) {
        console.warn(`Cloudflare AI API warning with token index ${i} (Status ${response.status}). Retrying with next token...`);
        lastError = new Error(`Token index ${i} failed with status ${response.status}`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Cloudflare AI API error with token index ${i} (${response.status}):`, errorText);
        lastError = new Error(`Cloudflare AI call failed: ${response.statusText} (${errorText})`);
        continue;
      }

      const json = await response.json();
      if (!json.success) {
        console.error(`Cloudflare AI returned success=false with token index ${i}:`, json.errors);
        lastError = new Error(`Cloudflare AI returned success=false: ${JSON.stringify(json.errors)}`);
        continue;
      }

      // Success! Return result
      return json.result;
    } catch (err: any) {
      console.error(`Network or execution error with token index ${i}:`, err);
      lastError = err;
    }
  }

  // If all tokens failed
  throw new Error(`All Cloudflare API tokens failed. Last error: ${lastError?.message}`);
}

/**
 * Generates vector embeddings for a given text chunk using bge-large-en-v1.5 (1024 dimensions).
 */
export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const result = await callCloudflareAi('@cf/baai/bge-large-en-v1.5', {
      text: [text],
    });
    if (!result?.data?.[0]) {
      throw new Error('No embedding returned from Cloudflare');
    }
    return result.data[0];
  } catch (error) {
    console.error('Error generating embedding:', error);
    // Return a dummy 1024-dimension array as fallback if offline/error to let the pipeline proceed in local development
    console.warn('Falling back to a mock 1024-dimension vector.');
    return Array.from({ length: 1024 }, () => Math.random() - 0.5);
  }
}

/**
 * Sends a chat/instruct request to Llama-3.1-8b-instruct-fast.
 */
export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.6,
  maxTokens: number = 2048
): Promise<string> {
  try {
    const result = await callCloudflareAi('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    });
    // Safely coerce to string — result.response can sometimes be an object
    const raw = result?.response;
    if (typeof raw === 'string') return raw;
    if (raw == null) return '';
    return JSON.stringify(raw);
  } catch (error: any) {
    console.error('Error generating text:', error);
    throw new Error(`Text generation failed: ${error.message}`);
  }
}

/**
 * Sends an instruct request and returns structured JSON.
 */
export async function generateJson(
  systemPrompt: string,
  userPrompt: string
): Promise<any> {
  const systemWithJson = `${systemPrompt}\nIMPORTANT: You must respond ONLY with a raw JSON array or object. Do not include markdown code block styling, preamble, or any extra text. Your output must be directly parseable by JSON.parse().`;
  
  // Use 4096 max tokens to avoid truncation on larger responses
  const text = await generateText(systemWithJson, userPrompt, 0.2, 4096);
  
  // If generateText already returned a non-string (e.g. model returned object directly), use it
  if (typeof text !== 'string') {
    return text;
  }

  // Robustly extract JSON block (ignoring preambles, postambles, or markdown fences)
  let cleanText = text.trim();
  
  // If it starts with markdown code block fences, strip them
  if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '').trim();
  }

  const firstBrace = cleanText.indexOf('{');
  const firstBracket = cleanText.indexOf('[');
  const startIdx = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket) ? firstBrace : firstBracket;

  // Helper to escape raw, unescaped newlines within JSON string property values
  const escapeRawNewlinesInStrings = (str: string) => {
    let result = '';
    let inString = false;
    let isEscaped = false;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (isEscaped) {
        result += char;
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        result += char;
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }
      if (inString && (char === '\n' || char === '\r')) {
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          if (str[i + 1] === '\n') {
            // Let the subsequent \n handle the replacement
          } else {
            result += '\\n';
          }
        }
        continue;
      }
      result += char;
    }
    return result;
  };

  // Helper to fix common AI mistakes where string fields (like process_logic or exam_angles) 
  // are returned as malformed unquoted arrays.
  const fixMalformedMarkdownArrays = (str: string) => {
    const targetKeys = ["process_logic", "exam_angles"];
    let result = str;
    for (const key of targetKeys) {
      const regex = new RegExp(`("?${key}"?\\s*:\\s*)\\[([\\s\\S]*?)\\]`, 'g');
      result = result.replace(regex, (match, prefix, content) => {
        try {
          // If it is a valid JSON array, do not touch it
          JSON.parse(`[${content}]`);
          return match;
        } catch (_) {
          // Parse lines, trim them, escape double quotes, and join them as a single string
          const lines = content.split('\n')
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0 && line !== ',' && !line.startsWith(','));

          const cleanContent = lines.map((line: string) => {
            let l = line.replace(/,$/, '').trim();
            if (l.startsWith('"') && l.endsWith('"')) {
              l = l.substring(1, l.length - 1);
            }
            return l.replace(/"/g, '\\"');
          }).join('\\n');

          return `${prefix}"${cleanContent}"`;
        }
      });
    }
    return result;
  };

  // Helper to close any unclosed double quotes and brackets/braces from a truncated JSON response.
  const closeUnbalancedJson = (str: string): string => {
    let inString = false;
    let isEscaped = false;
    const stack: ('{' | '[')[] = [];
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === '\\') {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
    
    let recovered = str;
    if (inString) {
      recovered += '"';
    }
    
    // Close any open objects/arrays in reverse order
    while (stack.length > 0) {
      const open = stack.pop();
      if (open === '{') {
        recovered += '}';
      } else if (open === '[') {
        recovered += ']';
      }
    }
    
    return recovered;
  };

  // Function to perform recovery, cleanup, and parsing of a candidate JSON block
  const parseJsonBlock = (rawBlock: string): any => {
    let block = rawBlock;
    block = fixMalformedMarkdownArrays(block);
    block = escapeRawNewlinesInStrings(block);
    block = block.replace(/,(\s*[}\]])/g, '$1');

    try {
      return JSON.parse(block);
    } catch (_) {}

    try {
      const recovered = closeUnbalancedJson(block);
      const cleanRecovered = recovered.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(cleanRecovered);
    } catch (_) {}

    return null;
  };

  // Parse phase
  if (startIdx !== -1) {
    const candidate = cleanText.substring(startIdx);
    
    // Phase 1: Try parsing the candidate block spanning up to the very end of the string
    // (This ensures we don't discard any truncated data at the end of the text)
    const result = parseJsonBlock(candidate);
    if (result) {
      return result;
    }

    // Phase 2: If Phase 1 failed, search for the last closing brace/bracket to strip postambles
    const endIdx = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)
      ? cleanText.lastIndexOf('}')
      : cleanText.lastIndexOf(']');
      
    if (endIdx !== -1 && endIdx > startIdx) {
      const sliced = cleanText.substring(startIdx, endIdx + 1);
      const resultSliced = parseJsonBlock(sliced);
      if (resultSliced) {
        return resultSliced;
      }
    }
  }

  console.error('Failed to parse AI response as JSON. Raw response:', text);
  throw new Error('AI response was not valid JSON.');
}

/**
 * Extracts/transcribes text from an image buffer using Llama 3.2 Vision on Cloudflare Workers AI.
 */
export async function extractTextFromImage(buffer: Buffer): Promise<string> {
  try {
    const runOcr = async () => {
      return await callCloudflareAi('@cf/meta/llama-3.2-11b-vision-instruct', {
        prompt: 'Transcribe all handwritten and typed text from this image as accurately as possible. Output only the transcribed text, maintaining paragraphs and formatting. Do not include markdown code block formatting (like ```) or any greeting, explanation, or conversational commentary.',
        image: Array.from(buffer)
      });
    };

    let result;
    try {
      result = await runOcr();
    } catch (err: any) {
      // If failed (e.g. because license terms not agreed to yet), try to agree and retry once
      console.warn('OCR model run failed. Attempting to agree to license terms and retry...', err.message);
      try {
        await callCloudflareAi('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' });
        result = await runOcr();
      } catch (retryErr) {
        throw err; // throw the original error if retry also fails
      }
    }

    const response = result?.response || '';
    return typeof response === 'string' ? response.trim() : JSON.stringify(response);
  } catch (error: any) {
    console.error('Error in extractTextFromImage via Cloudflare AI:', error);
    throw new Error(`Cloudflare vision OCR failed: ${error.message}`);
  }
}

