'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  AlertCircle, 
  Upload, 
  Loader2, 
  Mic, 
  MicOff, 
  Copy, 
  Check,
  FileAudio,
  Globe
} from 'lucide-react';

interface STTResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

// 流式STT结果接口
interface StreamingSTTResult {
  text?: string;
  partialText?: string;
  confidence: number;
  language: string;
  isPartial: boolean;
  isFinal: boolean;
  timestamp: number;
}

export default function SpeechToText() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('zh'); // 默认中文
  const [selectedModel, setSelectedModel] = useState('base');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<STTResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // 流式识别相关状态
  const [isStreamingMode, setIsStreamingMode] = useState(true); // 默认开启流式模式
  const [streamingResult, setStreamingResult] = useState<StreamingSTTResult | null>(null);
  const [partialTexts, setPartialTexts] = useState<string[]>([]);
  const [streamingSession, setStreamingSession] = useState<string | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false); // 防止并发处理
  const [queueLength, setQueueLength] = useState(0); // 队列长度状态
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkCounterRef = useRef<number>(0);
  const audioQueueRef = useRef<{ blob: Blob; sessionId: string }[]>([]); // 音频处理队列

  const supportedLanguages = [
    { value: 'auto', label: '🌐 自动检测' },
    { value: 'zh', label: '🇨🇳 中文 (普通话)' },
    { value: 'zh-tw', label: '🇹🇼 中文 (繁体)' },
    { value: 'zh-yue', label: '🇭🇰 粤语' },
    { value: 'en', label: '🇺🇸 English' },
    { value: 'ja', label: '🇯🇵 日本語' },
    { value: 'ko', label: '🇰🇷 한국어' },
    { value: 'es', label: '🇪🇸 Español' },
    { value: 'fr', label: '🇫🇷 Français' },
    { value: 'de', label: '🇩🇪 Deutsch' },
    { value: 'ru', label: '🇷🇺 Русский' },
    { value: 'pt', label: '🇵🇹 Português' },
    { value: 'it', label: '🇮🇹 Italiano' },
    { value: 'ar', label: '🇸🇦 العربية' },
    { value: 'hi', label: '🇮🇳 हिन्दी' },
    { value: 'th', label: '🇹🇭 ไทย' },
    { value: 'vi', label: '🇻🇳 Tiếng Việt' },
  ];

  const availableModels = [
    { value: 'tiny', label: 'Tiny (最快，精度较低)' },
    { value: 'base', label: 'Base (推荐，平衡速度和精度)' },
    { value: 'small', label: 'Small (精度较高)' },
    { value: 'medium', label: 'Medium (高精度)' },
    { value: 'large', label: 'Large (最高精度，较慢)' },
  ];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 验证文件类型
      const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/m4a'];
      if (!allowedTypes.includes(file.type)) {
        setError('不支持的音频格式。请上传 WAV、MP3、OGG、WebM 或 M4A 文件。');
        return;
      }

      // 验证文件大小 (50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('文件太大。最大支持50MB的音频文件。');
        return;
      }

      setSelectedFile(file);
      setError('');
    }
  };

  const handleSpeechToText = async () => {
    if (!selectedFile) {
      setError('请选择音频文件或录制音频');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('language', selectedLanguage === 'auto' ? '' : selectedLanguage);
      formData.append('model', selectedModel);
      formData.append('user_id', '1');

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '语音转文本失败');
      }

      const data = await response.json();
      setResult({
        text: data.text,
        confidence: data.confidence,
        language: data.language,
        duration: data.duration,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = useCallback(async () => {
    if (isStreamingMode) {
      return startStreamingRecording();
    } else {
      return startTraditionalRecording();
    }
  }, [isStreamingMode]);

  const stopRecording = useCallback(() => {
    if (isStreamingMode) {
      return stopStreamingRecording();
    } else {
      return stopTraditionalRecording();
    }
  }, [isStreamingMode, isRecording]);

  // 传统录音模式 (原有功能)
  const startTraditionalRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], `recording_${Date.now()}.wav`, { type: 'audio/wav' });
        setSelectedFile(audioFile);
        
        // 停止所有音频轨道
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError('');
    } catch (err) {
      setError('无法访问麦克风。请检查浏览器权限设置。');
    }
  }, []);

  const stopTraditionalRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // 流式录音模式 (新功能)
  const startStreamingRecording = useCallback(async () => {
    try {
      setError('');
      setStreamingResult(null);
      setPartialTexts([]);
      chunkCounterRef.current = 0;

      console.log(`准备开始流式录音 - 语言: ${selectedLanguage}, 模型: ${selectedModel}`);

      // 初始化流式会话
      const sessionResponse = await fetch('/api/stt/stream', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLanguage === 'auto' ? undefined : selectedLanguage,
          model: selectedModel,
        }),
      });

      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        console.error('会话初始化失败:', sessionResponse.status, errorText);
        throw new Error(`无法初始化流式会话: ${sessionResponse.status}`);
      }

      const sessionData = await sessionResponse.json();
      
      if (!sessionData.success) {
        throw new Error(sessionData.error || '会话初始化失败');
      }

      setStreamingSession(sessionData.sessionId);
      
      console.log(`流式录音会话已创建: ${sessionData.sessionId}, 语言: ${selectedLanguage}`);

      // 获取音频流
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });
      
      streamRef.current = stream;
      
      // 检查浏览器支持的MediaRecorder格式
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/wav';
        }
      }
      
      console.log(`使用音频格式: ${mimeType}`);
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // 设置音频数据处理
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          console.log(`收到音频数据: ${event.data.size} bytes, 类型: ${event.data.type}`);
          // 使用队列处理避免并发问题
          enqueueAudioChunk(event.data, sessionData.sessionId);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder错误:', event);
        setError('录音过程中发生错误');
      };

      // 开始录音，每500ms发送一次数据
      mediaRecorder.start(500);
      setIsRecording(true);
      
      console.log('流式录音已开始');
      
    } catch (err) {
      console.error('流式录音启动失败:', err);
      setError(err instanceof Error ? err.message : '无法开始流式录音');
      
      // 清理资源
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setStreamingSession(null);
    }
  }, [selectedLanguage, selectedModel]);

  const stopStreamingRecording = useCallback(async () => {
    try {
      console.log('准备停止流式录音...');
      
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // 等待队列处理完成
      console.log('等待音频队列处理完成...');
      let attempts = 0;
      while (audioQueueRef.current.length > 0 && attempts < 30) { // 最多等待3秒
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      console.log(`队列处理完成，剩余: ${audioQueueRef.current.length} 个音频块`);

      // 结束流式会话
      if (streamingSession) {
        console.log(`结束流式会话: ${streamingSession}`);
        
        await fetch('/api/stt/stream', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: streamingSession }),
        });
        
        setStreamingSession(null);
      }

      // 清理队列
      audioQueueRef.current = [];
      setQueueLength(0);
      console.log('流式录音已完全停止');
      
    } catch (err) {
      console.error('停止流式录音失败:', err);
    }
  }, [isRecording, streamingSession]);

  // 处理音频队列
  const processAudioQueue = useCallback(async () => {
    if (isProcessingAudio || audioQueueRef.current.length === 0) {
      return;
    }

    setIsProcessingAudio(true);

    try {
      while (audioQueueRef.current.length > 0) {
        const { blob, sessionId } = audioQueueRef.current.shift()!;
        setQueueLength(audioQueueRef.current.length);
        await processAudioChunk(blob, sessionId);
        
        // 小延迟避免API过载
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('处理音频队列失败:', error);
    } finally {
      setIsProcessingAudio(false);
      setQueueLength(audioQueueRef.current.length);
    }
  }, [isProcessingAudio]);

  // 添加音频到队列
  const enqueueAudioChunk = useCallback((blob: Blob, sessionId: string) => {
    audioQueueRef.current.push({ blob, sessionId });
    setQueueLength(audioQueueRef.current.length);
    processAudioQueue();
  }, [processAudioQueue]);

  // 处理音频块
  const processAudioChunk = async (audioBlob: Blob, sessionId: string) => {
    try {
      // 检查音频块大小
      if (audioBlob.size === 0) {
        console.log('跳过空音频块');
        return;
      }

      console.log(`开始处理音频块，会话: ${sessionId}, 大小: ${audioBlob.size} bytes`);

      // 将音频转换为base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // 处理大文件，分块编码避免内存问题
      let audioBase64 = '';
      if (arrayBuffer.byteLength > 100000) { // 100KB以上分块处理
        const chunkSize = 50000;
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          audioBase64 += btoa(String.fromCharCode(...chunk));
        }
      } else {
        const uint8Array = new Uint8Array(arrayBuffer);
        audioBase64 = btoa(String.fromCharCode(...uint8Array));
      }
      
      chunkCounterRef.current += 1;
      const isFirstChunk = chunkCounterRef.current === 1;
      
      console.log(`发送音频块 #${chunkCounterRef.current}, 会话: ${sessionId}, 大小: ${audioBlob.size} bytes, Base64长度: ${audioBase64.length}`);

      // 发送到流式STT API
      const response = await fetch('/api/stt/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioChunk: audioBase64,
          language: selectedLanguage === 'auto' ? undefined : selectedLanguage,
          sessionId: sessionId,
          isFirstChunk: isFirstChunk,
          isFinalChunk: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API响应错误:', response.status, errorText);
        throw new Error(`流式转换请求失败: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('API响应成功:', data);
      
      if (data.success) {
        // 更新流式结果
        setStreamingResult({
          text: data.text,
          partialText: data.partialText,
          confidence: data.confidence,
          language: data.language,
          isPartial: data.isPartial,
          isFinal: data.isFinal,
          timestamp: data.timestamp,
        });

        // 累积部分结果
        if (data.partialText) {
          setPartialTexts(prev => {
            const newTexts = [...prev];
            newTexts[chunkCounterRef.current - 1] = data.partialText;
            return newTexts;
          });
        }
      } else {
        console.error('API返回错误:', data.error);
        setError(`转换失败: ${data.error}`);
      }
    } catch (err) {
      console.error('处理音频块失败:', err);
      setError(`音频处理失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleCopyText = async () => {
    const textToCopy = isStreamingMode ? 
      (streamingResult?.partialText || streamingResult?.text || '') : 
      (result?.text || '');
      
    if (textToCopy) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        setError('复制失败，请手动复制文本');
      }
    }
  };

  const handleDetectLanguage = async () => {
    if (!selectedFile) {
      setError('请先选择音频文件');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);

      const response = await fetch('/api/stt', {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '语言检测失败');
      }

      const data = await response.json();
      setSelectedLanguage(data.language);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '语言检测失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 音频输入区域 */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 文件上传 */}
          <Card className="p-4">
            <div className="space-y-3">
              <Label htmlFor="file-upload" className="text-sm font-medium">
                上传音频文件
              </Label>
              <div 
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileAudio className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedFile ? selectedFile.name : '点击选择音频文件'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  支持 WAV, MP3, OGG, WebM, M4A (最大50MB)
                </p>
              </div>
              <Input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
            </div>
          </Card>

          {/* 录音功能 */}
          <Card className="p-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">实时录音</Label>
              <div className="flex flex-col items-center justify-center p-6 space-y-3">
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  variant={isRecording ? "destructive" : "default"}
                  size="lg"
                  className="w-full"
                >
                  {isRecording ? (
                    <>
                      <MicOff className="mr-2 h-4 w-4" />
                      停止录音
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      开始录音
                    </>
                  )}
                </Button>
                {isRecording && (
                  <div className="text-sm text-red-600 dark:text-red-400 animate-pulse">
                    🔴 正在录音...
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {selectedFile && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  已选择文件: {selectedFile.name}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDetectLanguage}
                disabled={isLoading}
              >
                <Globe className="mr-1 h-3 w-3" />
                检测语言
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 设置选项 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="language-select">识别语言</Label>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger id="language-select">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-select">识别模型</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger id="model-select">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.value} value={model.value}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="mode-select">识别模式</Label>
          <Select value={isStreamingMode ? 'streaming' : 'traditional'} onValueChange={(value) => setIsStreamingMode(value === 'streaming')}>
            <SelectTrigger id="mode-select">
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="streaming">🔄 实时流式转换</SelectItem>
              <SelectItem value="traditional">📁 文件批量转换</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* 转换按钮 */}
      {!isStreamingMode && (
        <div className="flex gap-3">
          <Button
            onClick={handleSpeechToText}
            disabled={isLoading || !selectedFile}
            className="flex-1 md:flex-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                转换中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始转换
              </>
            )}
          </Button>
        </div>
      )}

      {/* 实时转换状态显示 */}
      {isStreamingMode && streamingSession && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                实时转换进行中
              </span>
              {isProcessingAudio && (
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  (处理中...)
                </span>
              )}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400">
              会话: {streamingSession.slice(-8)}
              {queueLength > 0 && (
                <span className="ml-2">队列: {queueLength}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 流式转换实时结果 */}
      {isStreamingMode && streamingResult && (
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  🔄 实时转换结果
                </h3>
                <div className="flex gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <span>语言: {streamingResult.language}</span>
                  <span>•</span>
                  <span>置信度: {(streamingResult.confidence * 100).toFixed(1)}%</span>
                  <span>•</span>
                  <span className={streamingResult.isPartial ? "text-orange-500" : "text-green-500"}>
                    {streamingResult.isPartial ? "处理中..." : "完成"}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Textarea
                  value={streamingResult.partialText || streamingResult.text || ''}
                  readOnly
                  className="min-h-[100px] resize-none bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                  placeholder="等待语音输入..."
                />
                
                {/* 显示历史部分结果 */}
                {partialTexts.length > 1 && (
                  <div className="mt-4">
                    <Label className="text-sm text-gray-600 dark:text-gray-400">处理历史:</Label>
                    <div className="max-h-32 overflow-y-auto space-y-1 mt-2">
                      {partialTexts.filter(text => text).map((text, index) => (
                        <div key={index} className="text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded border-l-2 border-blue-300">
                          <span className="text-gray-500">#{index + 1}</span> {text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyText}
                    disabled={!streamingResult.partialText && !streamingResult.text}
                  >
                    {isCopied ? (
                      <>
                        <Check className="mr-2 h-3 w-3" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-3 w-3" />
                        复制文本
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 传统转换结果 */}
      {!isStreamingMode && result && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">转换结果</h3>
                <div className="flex gap-2 text-sm text-gray-500">
                  <span>语言: {result.language}</span>
                  <span>•</span>
                  <span>置信度: {(result.confidence * 100).toFixed(1)}%</span>
                  <span>•</span>
                  <span>时长: {(result.duration / 1000).toFixed(1)}s</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Textarea
                  value={result.text}
                  readOnly
                  className="min-h-[100px] resize-none"
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyText}
                  >
                    {isCopied ? (
                      <>
                        <Check className="mr-2 h-3 w-3" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-3 w-3" />
                        复制文本
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 使用说明 */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 使用说明
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            {isStreamingMode ? (
              <>
                <li>• 🔄 <strong>实时流式模式</strong>：开启录音后立即开始转换，实时显示结果</li>
                <li>• 🎯 <strong>语言预设置</strong>：录音前请选择目标语言，提高识别准确性</li>
                <li>• 📊 <strong>流式输出</strong>：每500ms处理一次音频，动态更新转换结果</li>
                <li>• ⚡ <strong>低延迟</strong>：边录音边转换，无需等待录音结束</li>
                <li>• 📝 <strong>历史记录</strong>：显示每个音频片段的处理进度和结果</li>
                <li>• 🔊 <strong>音质优化</strong>：支持回声消除、噪声抑制、自动增益控制</li>
              </>
            ) : (
              <>
                <li>• 📁 <strong>文件批量模式</strong>：上传音频文件或录音后批量转换</li>
                <li>• 🎵 支持多种音频格式：WAV, MP3, OGG, WebM, M4A</li>
                <li>• 📏 最大文件大小：50MB</li>
                <li>• 🌍 支持多种语言自动识别或手动选择</li>
                <li>• 🔧 可选择不同精度的识别模型</li>
                <li>• 📊 提供识别置信度和语言检测功能</li>
              </>
            )}
            <li>• 🎛️ <strong>模式切换</strong>：可在实时流式转换和文件批量转换间切换</li>
            <li>• 🇨🇳 <strong>中文优化</strong>：针对中文语音识别进行特别优化</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}