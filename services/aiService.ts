import { AppMode, ModelParameters, ModelType } from '../types';
import { AI_CONFIG, getModeModel, AI_PROMPTS, fillPromptTemplate, AIInputVariables, DEFAULT_MODEL_PARAMETERS } from './aiConfig';

export interface AIResponse {
  answer: string;
  reasoning_content?: string;
  conversation_id?: string;
  message_id?: string;
}

export interface StreamCallbacks {
  onChunk: (text: string, reasoning?: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

// 构建消息列表
function buildMessages(prompt: string, userInput: string) {
  return [
    {
      role: 'system' as const,
      content: prompt
    },
    {
      role: 'user' as const,
      content: userInput
    }
  ];
}

// 调用 DeepSeek API
export async function callAI(
  mode: AppMode,
  userInput: string,
  variables: AIInputVariables,
  signal?: AbortSignal,
  modelParams?: ModelParameters,
  bodyModelType?: ModelType
): Promise<AIResponse> {
  const prompt = AI_PROMPTS[mode];
  if (!prompt) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const model = getModeModel(mode, bodyModelType);
  const filledPrompt = fillPromptTemplate(prompt, variables);

  // 使用传入的参数或默认值
  const params = modelParams || DEFAULT_MODEL_PARAMETERS;

  const response = await fetch(`${AI_CONFIG.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(filledPrompt, userInput),
      temperature: params.temperature,
      top_p: params.topP,
      presence_penalty: params.presencePenalty,
      frequency_penalty: params.frequencyPenalty,
      max_tokens: params.maxTokens,
    }),
    signal
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`DeepSeek API Error: ${data.error.message}`);
  }

  return {
    answer: data.choices[0]?.message?.content || '',
    reasoning_content: data.choices[0]?.message?.reasoning_content || '',
    conversation_id: data.id,
    message_id: data.choices[0]?.message?.id
  };
}

// 流式调用 DeepSeek API
export async function streamAI(
  mode: AppMode,
  userInput: string,
  variables: AIInputVariables,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  modelParams?: ModelParameters,
  bodyModelType?: ModelType
): Promise<void> {
  const prompt = AI_PROMPTS[mode];
  if (!prompt) {
    callbacks.onError(new Error(`Unknown mode: ${mode}`));
    return;
  }

  const model = getModeModel(mode, bodyModelType);
  const filledPrompt = fillPromptTemplate(prompt, variables);

  // 使用传入的参数或默认值
  const params = modelParams || DEFAULT_MODEL_PARAMETERS;

  try {
    const response = await fetch(`${AI_CONFIG.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(filledPrompt, userInput),
        temperature: params.temperature,
        top_p: params.topP,
        presence_penalty: params.presencePenalty,
        frequency_penalty: params.frequencyPenalty,
        max_tokens: params.maxTokens,
        stream: true,
      }),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} - ${err}`);
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6);
          if (jsonStr === '[DONE]') {
            callbacks.onComplete();
            return;
          }
          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta;
            if (delta) {
              // DeepSeek Reasoner返回reasoning_content和content
              const reasoning = delta.reasoning_content;
              const content = delta.content;
              if (content) {
                callbacks.onChunk(content, reasoning || undefined);
              } else if (reasoning) {
                // 如果没有content但有reasoning，也回调（用于显示思考过程）
                callbacks.onChunk('', reasoning);
              }
            }
          } catch (e) {
            console.warn("Failed to parse stream chunk", e);
          }
        }
      }
    }

    callbacks.onComplete();
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    console.error("DeepSeek Stream Failed", error);
    callbacks.onError(error as Error);
  }
}
