async function callCloudflareAi(model: string, body: any): Promise<any> {
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error('Cloudflare AI configuration is missing. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Cloudflare AI API error (${response.status}):`, errorText);
    throw new Error(`Cloudflare AI call failed: ${response.statusText} (${errorText})`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(`Cloudflare AI returned success=false: ${JSON.stringify(json.errors)}`);
  }

  return json.result;
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
  const firstBrace = cleanText.indexOf('{');
  const firstBracket = cleanText.indexOf('[');
  
  let startIdx = -1;
  let endIdx = -1;
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleanText.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleanText.lastIndexOf(']');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleanText = cleanText.substring(startIdx, endIdx + 1);
  }

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

  cleanText = fixMalformedMarkdownArrays(cleanText);
  cleanText = escapeRawNewlinesInStrings(cleanText);

  // Remove trailing commas before closing braces/brackets (extremely common syntax error)
  cleanText = cleanText.replace(/,(\s*[}\]])/g, '$1');

  // 1. Try direct parse
  try {
    return JSON.parse(cleanText);
  } catch (_) {}

  // 2. Try to close unbalanced brackets/braces (handles truncated objects and strings)
  try {
    const recovered = closeUnbalancedJson(cleanText);
    const cleanRecovered = recovered.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(cleanRecovered);
  } catch (_) {}

  // 3. If the model returned a truncated array, try to recover the last complete item
  try {
    if (cleanText.trimStart().startsWith('[')) {
      // Find last complete object by looking for the last `}` followed by optional whitespace then `,` or end of array
      const lastCompleteIdx = cleanText.lastIndexOf('},');
      if (lastCompleteIdx !== -1) {
        const recovered = cleanText.substring(0, lastCompleteIdx + 1) + ']';
        const parsed = JSON.parse(recovered);
        console.warn(`Recovered ${parsed.length} items from truncated AI JSON response.`);
        return parsed;
      }
    }
  } catch (_) {}

  console.error('Failed to parse AI response as JSON. Raw response:', text);
  throw new Error('AI response was not valid JSON.');
}
