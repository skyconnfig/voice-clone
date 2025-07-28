'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TextToSpeech from '@/components/TextToSpeech';
import SpeechToText from '@/components/SpeechToText';
import VoiceClone from '@/components/VoiceClone';

export default function Home() {
  const [activeTab, setActiveTab] = useState('tts');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            声音克隆平台
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            基于 AI 技术的声音克隆和语音处理平台，支持文本转语音、语音转文本和个人声音克隆功能
          </p>
        </header>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="tts" className="text-sm md:text-base">
                文本转语音
              </TabsTrigger>
              <TabsTrigger value="stt" className="text-sm md:text-base">
                语音转文本
              </TabsTrigger>
              <TabsTrigger value="clone" className="text-sm md:text-base">
                声音克隆
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    🗣️ 文本转语音
                  </CardTitle>
                  <CardDescription>
                    将文本转换为自然流畅的语音，支持多种声音模型和语速调节
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TextToSpeech />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stt" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    🎤 语音转文本
                  </CardTitle>
                  <CardDescription>
                    将语音文件或实时录音转换为文本，支持多种语言识别
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SpeechToText />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="clone" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    🎭 声音克隆
                  </CardTitle>
                  <CardDescription>
                    上传语音样本，创建个性化的声音模型，用于文本转语音合成
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <VoiceClone />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            基于 Next.js + TypeScript + Fish Audio API + Whisper 构建
          </p>
          <p className="mt-2">
            © 2025 声音克隆平台. 技术演示项目.
          </p>
        </footer>
      </div>
    </div>
  );
}
