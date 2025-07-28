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

export default function SpeechToText() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [selectedModel, setSelectedModel] = useState('base');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<STTResult | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const supportedLanguages = [
    { value: 'auto', label: '自动检测' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本语' },
    { value: 'ko', label: '한국어' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'ru', label: 'Русский' },
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

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleCopyText = async () => {
    if (result?.text) {
      try {
        await navigator.clipboard.writeText(result.text);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* 转换按钮 */}
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

      {/* 转换结果 */}
      {result && (
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
            <li>• 支持上传音频文件或实时录音</li>
            <li>• 支持多种音频格式：WAV, MP3, OGG, WebM, M4A</li>
            <li>• 最大文件大小：50MB</li>
            <li>• 支持多种语言自动识别</li>
            <li>• 可选择不同精度的识别模型</li>
            <li>• 提供识别置信度和语言检测功能</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}