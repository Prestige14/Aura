// src/lib/venice-ai.ts
// Venice AI API client
// Base URL: https://api.venice.ai/api/v1
// OpenAI-compatible with Venice-specific extensions

const VENICE_BASE_URL = process.env.NEXT_PUBLIC_VENICE_API_BASE || 'https://api.venice.ai/api/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  venice_parameters?: {
    include_venice_system_prompt?: boolean;
    character_slug?: string;
  };
}

interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ImageGenerationRequest {
  model: string;
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number;
  format?: 'webp' | 'png' | 'jpeg';
  safe_mode?: boolean;
}

interface ImageGenerationResponse {
  id: string;
  images: {
    b64: string; // base64-encoded image
    url?: string;
    seed: number;
  }[];
  request: {
    model: string;
    prompt: string;
  };
  timing: {
    inferenceDuration: number;
  };
}

const getAuthHeaders = (apiKey: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
});

/**
 * Generate text completion using Venice AI
 * Compatible with llama-3.3-70b, mistral-31-24b, etc.
 */
export const generateText = async (
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  model = 'llama-3.3-70b'
): Promise<string> => {
  const messages: ChatMessage[] = [
    ...(systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }]
      : []),
    { role: 'user' as const, content: prompt },
  ];

  const requestBody: ChatCompletionRequest = {
    model,
    messages,
    stream: false,
    temperature: 0.8,
    max_tokens: 2048,
    venice_parameters: {
      include_venice_system_prompt: false,
    },
  };

  const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getAuthHeaders(apiKey),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Venice AI text generation failed: ${response.status} - ${error}`);
  }

  const data: ChatCompletionResponse = await response.json();
  return data.choices[0]?.message?.content || '';
};

/**
 * Stream text completion from Venice AI
 * Returns a ReadableStream for real-time UI updates
 */
export const streamText = async (
  apiKey: string,
  prompt: string,
  systemPrompt?: string,
  model = 'llama-3.3-70b'
): Promise<ReadableStream<string>> => {
  const messages: ChatMessage[] = [
    ...(systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }]
      : []),
    { role: 'user' as const, content: prompt },
  ];

  const requestBody: ChatCompletionRequest = {
    model,
    messages,
    stream: true,
    temperature: 0.8,
    venice_parameters: {
      include_venice_system_prompt: false,
    },
  };

  const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: getAuthHeaders(apiKey),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Venice AI stream failed: ${response.status} - ${error}`);
  }

  // Transform SSE stream to string stream
  const decoder = new TextDecoder();

  return new ReadableStream<string>({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(content);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
};

/**
 * Generate an image using Venice AI
 * Uses /image/generate endpoint (Venice's primary image endpoint)
 */
export const generateImage = async (
  apiKey: string,
  prompt: string,
  options?: Partial<ImageGenerationRequest>
): Promise<string> => {
  const requestBody: ImageGenerationRequest = {
    model: options?.model || (process.env.NEXT_PUBLIC_VENICE_IMAGE_MODEL || 'fluently-xl'),
    prompt,
    negative_prompt: options?.negative_prompt || 'blurry, bad quality, distorted',
    width: options?.width || 1024,
    height: options?.height || 1024,
    steps: options?.steps || 20,
    cfg_scale: options?.cfg_scale || 7.5,
    format: options?.format || 'webp',
    safe_mode: options?.safe_mode ?? false,
  };

  const response = await fetch(`${VENICE_BASE_URL}/image/generate`, {
    method: 'POST',
    headers: getAuthHeaders(apiKey),
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Venice AI image generation failed: ${response.status} - ${error}`);
  }

  const data: ImageGenerationResponse = await response.json();
  const imageB64 = data.images?.[0]?.b64;

  if (!imageB64) {
    throw new Error('Venice AI returned no image data');
  }

  return `data:image/webp;base64,${imageB64}`;
};

/**
 * List available Venice AI models
 */
export const listModels = async (apiKey: string) => {
  const response = await fetch(`${VENICE_BASE_URL}/models`, {
    headers: getAuthHeaders(apiKey),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  return response.json();
};

export type { ChatMessage, ChatCompletionRequest, ImageGenerationRequest };
