import { DifyInputs, DifyResponse } from '../types';

export const sendMessageToDify = async (
  baseUrl: string,
  apiKey: string,
  query: string,
  inputs: DifyInputs,
  user: string = 'dify-novelist-user',
  signal?: AbortSignal
): Promise<DifyResponse> => {
  
  // Clean url
  const url = `${baseUrl.replace(/\/$/, '')}/chat-messages`;

  const body = {
    inputs,
    query,
    response_mode: 'blocking',
    user,
    auto_generate_name: false
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Dify API Error: ${response.status} - ${err}`);
    }

    const data: DifyResponse = await response.json();
    return data;
  } catch (error) {
    // Re-throw so the caller can handle AbortError specifically
    throw error;
  }
};

export const streamMessageToDify = async (
  baseUrl: string,
  apiKey: string,
  query: string,
  inputs: DifyInputs,
  user: string = 'dify-novelist-user',
  onChunk: (text: string) => void,
  onComplete: () => void,
  onError: (error: any) => void,
  signal?: AbortSignal
): Promise<void> => {
  const url = `${baseUrl.replace(/\/$/, '')}/chat-messages`;

  const body = {
    inputs,
    query,
    response_mode: 'streaming',
    user,
    auto_generate_name: false
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Dify API Error: ${response.status} - ${err}`);
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
        // Keep the last part if it's incomplete
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') continue;
                try {
                    const data = JSON.parse(jsonStr);
                    // Dify streaming events: 'message', 'agent_message'
                    if (data.event === 'message' || data.event === 'agent_message') {
                        if (data.answer) {
                            onChunk(data.answer);
                        }
                    } else if (data.event === 'error') {
                        throw new Error(data.message || 'Stream error');
                    }
                } catch (e) {
                    console.warn("Failed to parse stream chunk", e);
                }
            }
        }
    }
    
    // Process remaining buffer
    if (buffer.startsWith('data: ')) {
        try {
            const data = JSON.parse(buffer.substring(6));
             if (data.event === 'message' || data.event === 'agent_message') {
                if (data.answer) {
                    onChunk(data.answer);
                }
            }
        } catch (e) {
            // ignore incomplete tail
        }
    }

    onComplete();

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
        // Just rethrow aborts, caller handles cleanup
        throw error;
    }
    console.error("Dify Stream Failed", error);
    onError(error);
  }
};