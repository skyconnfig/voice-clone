'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, Download, Loader2, Play, Pause, Volume2 } from 'lucide-react';

interface VoiceModel {
  id: string;
  name: string;
  language: string;
  gender: string;
  description?: string;
}

export default function TextToSpeech() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('default_female_zh');
  const [speed, setSpeed] = useState([1.0]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<VoiceModel[]>([
    { id: 'default_female_zh', name: '默认女声（中文）', language: 'zh-CN', gender: 'female' },
    { id: 'default_male_zh', name: '默认男声（中文）', language: 'zh-CN', gender: 'male' },
    { id: 'default_female_en', name: 'Default Female (English)', language: 'en-US', gender: 'female' },
    { id: 'default_male_en', name: 'Default Male (English)', language: 'en-US', gender: 'male' },
  ]);

  const audioRef = useRef<HTMLAudioElement>(null);

  const handleTextToSpeech = async () => {
    if (!text.trim()) {
      setError('请输入要转换的文本');
      return;
    }

    if (text.length > 5000) {
      setError('文本长度不能超过5000个字符');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.trim(),
          voice_id: selectedVoice,
          speed: speed[0],
          user_id: 1,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '语音合成失败');
      }

      // 创建音频URL
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // 自动播放
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `tts_${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
  };

  return (
    <div className="space-y-6">
      {/* 文本输入区域 */}
      <div className="space-y-2">
        <Label htmlFor="text-input">输入文本</Label>
        <Textarea
          id="text-input"
          placeholder="请输入要转换为语音的文本..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[120px] resize-none"
          maxLength={5000}
        />
        <div className="text-sm text-gray-500 text-right">
          {text.length}/5000
        </div>
      </div>

      {/* 声音选择和设置 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="voice-select">选择声音</Label>
          <Select value={selectedVoice} onValueChange={setSelectedVoice}>
            <SelectTrigger id="voice-select">
              <SelectValue placeholder="选择声音模型" />
            </SelectTrigger>
            <SelectContent>
              {availableVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  <div className="flex items-center gap-2">
                    <span>{voice.name}</span>
                    <span className="text-xs text-gray-500">
                      {voice.language} • {voice.gender === 'female' ? '女声' : '男声'}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="speed-slider">语速: {speed[0].toFixed(1)}x</Label>
          <Slider
            id="speed-slider"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speed}
            onValueChange={setSpeed}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.5x (慢)</span>
            <span>1.0x (正常)</span>
            <span>2.0x (快)</span>
          </div>
        </div>
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <Button
          onClick={handleTextToSpeech}
          disabled={isLoading || !text.trim()}
          className="flex-1 md:flex-none"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              合成中...
            </>
          ) : (
            <>
              <Volume2 className="mr-2 h-4 w-4" />
              生成语音
            </>
          )}
        </Button>

        {audioUrl && (
          <>
            <Button variant="outline" onClick={handlePlay}>
              {isPlaying ? (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  播放
                </>
              )}
            </Button>

            <Button variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              下载
            </Button>
          </>
        )}
      </div>

      {/* 音频播放器 */}
      {audioUrl && (
        <Card>
          <CardContent className="pt-6">
            <audio
              ref={audioRef}
              controls
              className="w-full"
              onEnded={handleAudioEnded}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              <source src={audioUrl} type="audio/mpeg" />
              您的浏览器不支持音频播放。
            </audio>
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
            <li>• 支持最多5000个字符的文本输入</li>
            <li>• 可以选择不同的声音模型和语言</li>
            <li>• 语速可在0.5x到2.0x之间调节</li>
            <li>• 生成的音频可以在线播放和下载</li>
            <li>• 支持中文、英文等多种语言</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}