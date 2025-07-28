import { NextRequest, NextResponse } from 'next/server';
import { getWhisperService } from '@/lib/whisper';
import { getDatabase } from '@/lib/database';

// 允许的音频文件类型
const ALLOWED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/m4a',
  'audio/aac',
];

// 最大文件大小 (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    // 解析multipart/form-data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const language = formData.get('language') as string;
    const model = formData.get('model') as string;
    const userId = parseInt(formData.get('user_id') as string) || 1;

    // 输入验证
    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_AUDIO_TYPES.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `Unsupported audio format. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    console.log('STT request:', {
      filename: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
      language,
      model,
    });

    // 将文件转换为Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 调用Whisper服务
    const whisperService = getWhisperService();
    const sttResult = await whisperService.speechToText({
      audioBuffer: audioBuffer,
      language: language || undefined,
      model: (model as any) || 'base',
    });

    if (!sttResult.success) {
      console.error('STT failed:', sttResult.error);
      return NextResponse.json(
        { error: sttResult.error || 'Speech-to-text conversion failed' },
        { status: 500 }
      );
    }

    // 保存音频记录到数据库
    try {
      const db = getDatabase();
      const filename = `stt_${Date.now()}_${userId}_${audioFile.name}`;
      
      await db.createAudioRecord({
        user_id: userId,
        filename: filename,
        text_content: sttResult.text || '',
        type: 'stt',
      });

      console.log('Audio record saved:', filename);
    } catch (dbError) {
      console.error('Failed to save audio record:', dbError);
      // 继续处理，不因为数据库错误而失败
    }

    // 返回转录结果
    return NextResponse.json({
      success: true,
      text: sttResult.text,
      confidence: sttResult.confidence,
      language: sttResult.language,
      duration: sttResult.duration,
      model: model || 'base',
    });
  } catch (error) {
    console.error('STT API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // 获取Whisper模型信息
    const whisperService = getWhisperService();
    const models = whisperService.getAvailableModels();
    const status = whisperService.getStatus();

    return NextResponse.json({
      success: true,
      models: models,
      status: status,
      supportedFormats: ALLOWED_AUDIO_TYPES,
      maxFileSize: MAX_FILE_SIZE,
    });
  } catch (error) {
    console.error('Get STT info error:', error);
    return NextResponse.json(
      { error: 'Failed to get STT information' },
      { status: 500 }
    );
  }
}

// 语言检测端点
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_AUDIO_TYPES.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `Unsupported audio format. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // 将文件转换为Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 检测语言
    const whisperService = getWhisperService();
    const languageResult = await whisperService.detectLanguage(audioBuffer);

    return NextResponse.json({
      success: true,
      language: languageResult.language,
      confidence: languageResult.confidence,
    });
  } catch (error) {
    console.error('Language detection error:', error);
    return NextResponse.json(
      { error: 'Language detection failed' },
      { status: 500 }
    );
  }
}

// 处理OPTIONS请求（CORS）
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}