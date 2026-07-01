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
  temperature: number = 0.6
): Promise<string> {
  try {
    const result = await callCloudflareAi('@cf/meta/llama-3.1-8b-instruct-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
    });
    return result?.response || '';
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
  const systemWithJson = `${systemPrompt}\nIMPORTANT: You must respond ONLY with a raw JSON object. Do not include markdown code block styling (\`\`\`json or \`\`\`), markdown wrapper formatting, or any extra text. Your output must be directly parseable by JSON.parse().`;
  
  const text = await generateText(systemWithJson, userPrompt, 0.2);
  
  try {
    // Try parsing directly
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
  } catch (error) {
    console.error('Failed to parse AI response as JSON. Raw response:', text);
    throw new Error('AI response was not valid JSON.');
  }
}
