// Fish Audio API 客户端
export interface TTSRequest {
  reference_id: string;
  text: string;
  speed?: number;
  volume?: number;
  version?: string;
  cache?: boolean;
}

export interface TTSResponse {
  success: boolean;
  data?: Buffer;
  error?: string;
}

export interface VoiceModelInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
  description?: string;
}

export interface CloneRequest {
  audio_file: Buffer;
  name: string;
  description?: string;
}

export interface CloneResponse {
  success: boolean;
  model_id?: string;
  status?: 'training' | 'ready' | 'failed';
  error?: string;
}

class FishAudioClient {
  private apiToken: string;
  private baseUrl: string = 'https://fishaudio.net/api/open';
  private wsUrl: string = 'wss://api.fish.audio/v1/tts/live';

  constructor(apiToken?: string) {
    this.apiToken = apiToken || process.env.FISH_AUDIO_API_TOKEN || '';
    if (!this.apiToken) {
      throw new Error('Fish Audio API token is required');
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 文本转语音
   */
  async textToSpeech(request: TTSRequest): Promise<TTSResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/tts`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          reference_id: request.reference_id,
          text: request.text,
          speed: request.speed || 1.0,
          volume: request.volume || 0,
          version: request.version || 'v2',
          cache: request.cache || false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('TTS API error:', response.status, errorText);
        return {
          success: false,
          error: `TTS request failed: ${response.status} ${errorText}`,
        };
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      return {
        success: true,
        data: audioBuffer,
      };
    } catch (error) {
      console.error('TTS error:', error);
      return {
        success: false,
        error: `TTS request failed: ${error}`,
      };
    }
  }

  /**
   * 获取可用的声音模型列表
   * 注意：这个API端点可能需要根据实际情况调整
   */
  async getVoiceModels(): Promise<VoiceModelInfo[]> {
    try {
      // 由于API文档中没有明确的获取模型列表端点，
      // 这里使用一个假设的端点，实际使用时需要根据官方文档调整
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error('Get models error:', response.status);
        // 返回一些默认模型作为示例
        return this.getDefaultModels();
      }

      const models = await response.json();
      return models.data || [];
    } catch (error) {
      console.error('Get models error:', error);
      // 返回一些默认模型作为示例
      return this.getDefaultModels();
    }
  }

  /**
   * 获取默认声音模型列表（作为备用）
   */
  private getDefaultModels(): VoiceModelInfo[] {
    return [
      {
        id: 'default_female_zh',
        name: '默认女声（中文）',
        language: 'zh-CN',
        gender: 'female',
        description: '标准中文女声',
      },
      {
        id: 'default_male_zh',
        name: '默认男声（中文）',
        language: 'zh-CN',
        gender: 'male',
        description: '标准中文男声',
      },
      {
        id: 'default_female_en',
        name: 'Default Female (English)',
        language: 'en-US',
        gender: 'female',
        description: 'Standard English female voice',
      },
      {
        id: 'default_male_en',
        name: 'Default Male (English)',
        language: 'en-US',
        gender: 'male',
        description: 'Standard English male voice',
      },
    ];
  }

  /**
   * 声音克隆（创建新的声音模型）
   * 注意：这个功能需要根据实际API文档实现
   */
  async cloneVoice(request: CloneRequest): Promise<CloneResponse> {
    try {
      // 创建FormData用于文件上传
      const formData = new FormData();
      const blob = new Blob([request.audio_file], { type: 'audio/wav' });
      formData.append('audio_file', blob, 'voice_sample.wav');
      formData.append('name', request.name);
      if (request.description) {
        formData.append('description', request.description);
      }

      const response = await fetch(`${this.baseUrl}/clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          // 不设置Content-Type，让浏览器自动设置boundary
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Clone API error:', response.status, errorText);
        return {
          success: false,
          error: `Voice clone request failed: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        model_id: result.model_id,
        status: result.status || 'training',
      };
    } catch (error) {
      console.error('Clone error:', error);
      return {
        success: false,
        error: `Voice clone request failed: ${error}`,
      };
    }
  }

  /**
   * 检查声音模型状态
   */
  async checkModelStatus(modelId: string): Promise<{ status: string; ready: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/model/${modelId}/status`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error('Check model status error:', response.status);
        return { status: 'unknown', ready: false };
      }

      const result = await response.json();
      return {
        status: result.status,
        ready: result.status === 'ready',
      };
    } catch (error) {
      console.error('Check model status error:', error);
      return { status: 'error', ready: false };
    }
  }

  /**
   * 获取API积分余额
   */
  async getApiCredit(): Promise<{ credits: number; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/wallet/credit`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { credits: 0, error: `Failed to get credits: ${response.status}` };
      }

      const result = await response.json();
      return { credits: result.credits || 0 };
    } catch (error) {
      return { credits: 0, error: `Failed to get credits: ${error}` };
    }
  }

  /**
   * 创建WebSocket连接进行实时TTS
   */
  createWebSocketConnection(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      try {
        // 注意：这里需要在浏览器环境中使用
        const ws = new WebSocket(this.wsUrl, [], {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
          },
        });

        ws.onopen = () => {
          console.log('WebSocket connection established');
          resolve(ws);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 实时文本转语音（WebSocket）
   */
  async realtimeTTS(ws: WebSocket, request: TTSRequest): Promise<void> {
    const message = JSON.stringify({
      reference_id: request.reference_id,
      text: request.text,
      speed: request.speed || 1.0,
      version: request.version || 'v2',
    });

    ws.send(message);
  }
}

// 创建单例实例
let fishAudioInstance: FishAudioClient | null = null;

export function getFishAudioClient(): FishAudioClient {
  if (!fishAudioInstance) {
    fishAudioInstance = new FishAudioClient();
  }
  return fishAudioInstance;
}

export { FishAudioClient };
export default getFishAudioClient;