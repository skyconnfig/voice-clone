'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AlertCircle, 
  Upload, 
  Loader2, 
  Trash2, 
  Eye,
  FileAudio,
  User,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';

interface VoiceModel {
  id: number;
  model_id: string;
  model_name: string;
  status: 'training' | 'ready' | 'failed';
  created_at: string;
  ready?: boolean;
  last_checked?: string;
}

interface CloneProgress {
  step: string;
  progress: number;
  message: string;
}

export default function VoiceClone() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userModels, setUserModels] = useState<VoiceModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载用户的声音模型
  const loadUserModels = async () => {
    try {
      setIsLoadingModels(true);
      const response = await fetch('/api/clone?user_id=1');
      
      if (response.ok) {
        const data = await response.json();
        setUserModels(data.models || []);
      } else {
        console.error('Failed to load user models');
      }
    } catch (err) {
      console.error('Error loading user models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    loadUserModels();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 验证文件类型
      const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/m4a'];
      if (!allowedTypes.includes(file.type)) {
        setError('不支持的音频格式。请上传 WAV、MP3、OGG、WebM 或 M4A 文件。');
        return;
      }

      // 验证文件大小 (100MB)
      if (file.size > 100 * 1024 * 1024) {
        setError('文件太大。最大支持100MB的音频文件。');
        return;
      }

      setSelectedFile(file);
      setError('');
    }
  };

  const handleCloneVoice = async () => {
    if (!selectedFile) {
      setError('请选择音频文件');
      return;
    }

    if (!modelName.trim()) {
      setError('请输入模型名称');
      return;
    }

    if (modelName.length > 100) {
      setError('模型名称不能超过100个字符');
      return;
    }

    setIsLoading(true);
    setError('');
    setCloneProgress({ step: 'uploading', progress: 0, message: '正在上传音频文件...' });

    try {
      const formData = new FormData();
      formData.append('audio', selectedFile);
      formData.append('name', modelName.trim());
      formData.append('description', description.trim());
      formData.append('user_id', '1');

      setCloneProgress({ step: 'processing', progress: 30, message: '正在处理音频文件...' });

      const response = await fetch('/api/clone', {
        method: 'POST',
        body: formData,
      });

      setCloneProgress({ step: 'training', progress: 60, message: '正在训练声音模型...' });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '声音克隆失败');
      }

      const data = await response.json();
      
      setCloneProgress({ step: 'completed', progress: 100, message: '声音模型创建成功!' });

      // 清空表单
      setSelectedFile(null);
      setModelName('');
      setDescription('');
      
      // 重新加载模型列表
      setTimeout(() => {
        loadUserModels();
        setCloneProgress(null);
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setCloneProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = async (model: VoiceModel) => {
    if (!confirm(`确定要删除声音模型 "${model.model_name}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/clone?id=${model.id}&user_id=1`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // 从列表中移除已删除的模型
        setUserModels(prev => prev.filter(m => m.id !== model.id));
      } else {
        const errorData = await response.json();
        setError(errorData.error || '删除失败');
      }
    } catch (err) {
      setError('删除模型时发生错误');
    }
  };

  const handleRefreshModelStatus = async (model: VoiceModel) => {
    try {
      const response = await fetch(`/api/clone?model_id=${model.model_id}&user_id=1`);
      
      if (response.ok) {
        const data = await response.json();
        
        // 更新模型状态
        setUserModels(prev => prev.map(m => 
          m.id === model.id 
            ? { ...m, status: data.status, ready: data.ready, last_checked: new Date().toISOString() }
            : m
        ));
      }
    } catch (err) {
      console.error('Failed to refresh model status:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'training':
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready':
        return '就绪';
      case 'failed':
        return '失败';
      case 'training':
      default:
        return '训练中';
    }
  };

  return (
    <div className="space-y-6">
      {/* 声音克隆表单 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            创建声音模型
          </CardTitle>
          <CardDescription>
            上传您的语音样本，创建个性化的声音模型
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 文件上传 */}
          <div className="space-y-2">
            <Label htmlFor="audio-upload">音频样本 *</Label>
            <div 
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileAudio className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {selectedFile ? selectedFile.name : '点击选择音频文件'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                推荐上传10秒-5分钟的清晰语音文件 (WAV, MP3, OGG, WebM, M4A)
              </p>
            </div>
            <Input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
              id="audio-upload"
            />
          </div>

          {selectedFile && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                已选择文件: {selectedFile.name}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          {/* 模型信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model-name">模型名称 *</Label>
              <Input
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="为您的声音模型取个名字"
                maxLength={100}
              />
              <div className="text-xs text-gray-500 text-right">
                {modelName.length}/100
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述 (可选)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简单描述这个声音的特点"
                maxLength={200}
              />
            </div>
          </div>

          {/* 克隆进度 */}
          {cloneProgress && (
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      {cloneProgress.message}
                    </span>
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      {cloneProgress.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${cloneProgress.progress}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 错误信息 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          {/* 提交按钮 */}
          <Button
            onClick={handleCloneVoice}
            disabled={isLoading || !selectedFile || !modelName.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                创建中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                开始克隆
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 我的声音模型 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              我的声音模型
            </CardTitle>
            <Button variant="outline" size="sm" onClick={loadUserModels} disabled={isLoadingModels}>
              <RefreshCw className={`mr-2 h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
          <CardDescription>
            管理您创建的声音模型，可用于文本转语音功能
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingModels ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>加载中...</span>
            </div>
          ) : userModels.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileAudio className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p>还没有创建任何声音模型</p>
              <p className="text-sm mt-1">上传您的语音样本开始创建吧</p>
            </div>
          ) : (
            <div className="space-y-3">
              {userModels.map((model) => (
                <Card key={model.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{model.model_name}</h4>
                        <div className="flex items-center gap-1">
                          {getStatusIcon(model.status)}
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {getStatusText(model.status)}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        <p>模型ID: {model.model_id}</p>
                        <p>创建时间: {new Date(model.created_at).toLocaleString()}</p>
                        {model.last_checked && (
                          <p>最后检查: {new Date(model.last_checked).toLocaleString()}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {model.status === 'training' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRefreshModelStatus(model)}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteModel(model)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 使用说明 */}
      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 声音克隆使用指南
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• <strong>音频质量要求：</strong>上传清晰、无噪音的语音文件，推荐时长10秒-5分钟</li>
            <li>• <strong>文件格式：</strong>支持 WAV, MP3, OGG, WebM, M4A 格式，最大100MB</li>
            <li>• <strong>训练时间：</strong>模型训练通常需要几分钟到几小时不等</li>
            <li>• <strong>模型使用：</strong>训练完成后，可在文本转语音功能中选择您的声音模型</li>
            <li>• <strong>注意事项：</strong>请确保您有权使用所上传的语音样本</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}