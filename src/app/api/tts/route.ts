import { NextRequest, NextResponse } from 'next/server';
import { getFishAudioClient } from '@/lib/fish-audio';
import { getDatabase } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const body = await request.json();
    const { text, voice_id = 'default_female_zh', speed = 1.0, user_id = 1 } = body;

    // 输入验证
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required and must be a string' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text too long. Maximum 5000 characters allowed' },
        { status: 400 }
      );
    }

    if (speed < 0.5 || speed > 2.0) {
      return NextResponse.json(
        { error: 'Speed must be between 0.5 and 2.0' },
        { status: 400 }
      );
    }

    console.log('TTS request:', { text: text.substring(0, 50) + '...', voice_id, speed });

    // 调用Fish Audio API
    const fishAudio = getFishAudioClient();
    const ttsResult = await fishAudio.textToSpeech({
      reference_id: voice_id,
      text: text,
      speed: speed,
      version: 'v2',
      cache: false,
    });

    if (!ttsResult.success || !ttsResult.data) {
      console.error('TTS failed:', ttsResult.error);
      return NextResponse.json(
        { error: ttsResult.error || 'Text-to-speech conversion failed' },
        { status: 500 }
      );
    }

    // 保存音频记录到数据库
    try {
      const db = getDatabase();
      const filename = `tts_${Date.now()}_${user_id}.mp3`;
      
      await db.createAudioRecord({
        user_id: user_id,
        filename: filename,
        text_content: text,
        type: 'tts',
      });

      console.log('Audio record saved:', filename);
    } catch (dbError) {
      console.error('Failed to save audio record:', dbError);
      // 继续处理，不因为数据库错误而失败
    }

    // 返回音频数据
    const response = new NextResponse(ttsResult.data, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': ttsResult.data.length.toString(),
        'Content-Disposition': `attachment; filename="tts_${Date.now()}.mp3"`,
        'Cache-Control': 'no-cache',
      },
    });

    return response;
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // 获取可用的声音模型列表
    const fishAudio = getFishAudioClient();
    const models = await fishAudio.getVoiceModels();

    return NextResponse.json({
      success: true,
      models: models,
    });
  } catch (error) {
    console.error('Get voice models error:', error);
    return NextResponse.json(
      { error: 'Failed to get voice models' },
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}