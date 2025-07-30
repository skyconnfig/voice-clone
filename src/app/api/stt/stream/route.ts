import { NextRequest, NextResponse } from 'next/server';
import { getWhisperService } from '@/lib/whisper';

// 流式语音转文本端点
export async function POST(request: NextRequest) {
  try {
    console.log('收到流式STT POST请求');
    
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { audioChunk, language, sessionId, isFirstChunk, isFinalChunk } = body;

    console.log(`流式STT请求 - Session: ${sessionId}, Language: ${language}, First: ${isFirstChunk}, Final: ${isFinalChunk}`);

    if (!audioChunk) {
      console.error('缺少音频数据');
      return NextResponse.json(
        { error: 'Audio chunk is required' },
        { status: 400 }
      );
    }

    if (!sessionId) {
      console.error('缺少会话ID');
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // 将base64音频数据转换为Buffer
    let audioBuffer;
    try {
      audioBuffer = Buffer.from(audioChunk, 'base64');
      console.log(`音频数据解码成功，大小: ${audioBuffer.length} bytes`);
    } catch (decodeError) {
      console.error('Base64解码失败:', decodeError);
      return NextResponse.json(
        { error: 'Invalid base64 audio data' },
        { status: 400 }
      );
    }

    const whisperService = getWhisperService();
    
    console.log(`调用流式语音识别服务...`);
    
    // 流式处理音频片段
    const sttResult = await whisperService.streamingSpeechToText({
      audioBuffer: audioBuffer,
      language: language || undefined,
      sessionId: sessionId,
      isFirstChunk: isFirstChunk,
      isFinalChunk: isFinalChunk,
      model: 'base',
    });

    console.log(`流式STT结果:`, sttResult);

    if (!sttResult.success) {
      console.error('流式STT处理失败:', sttResult.error);
      return NextResponse.json(
        { error: sttResult.error || 'Streaming speech-to-text conversion failed' },
        { status: 500 }
      );
    }

    // 返回实时转录结果
    const response = {
      success: true,
      sessionId: sessionId,
      text: sttResult.text,
      partialText: sttResult.partialText,
      confidence: sttResult.confidence,
      language: sttResult.language,
      isPartial: sttResult.isPartial,
      isFinal: sttResult.isFinal,
      timestamp: Date.now(),
    };

    console.log(`返回流式STT响应:`, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('流式STT API错误:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// 开始流式会话
export async function PUT(request: NextRequest) {
  try {
    console.log('收到流式会话初始化请求');
    
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { language, model } = body;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    console.log(`初始化流式会话: ${sessionId}, Language: ${language}, Model: ${model}`);
    
    const whisperService = getWhisperService();
    
    // 初始化流式会话
    const initResult = await whisperService.initStreamingSession({
      sessionId,
      language: language || 'auto',
      model: model || 'base'
    });

    console.log(`会话初始化结果:`, initResult);

    if (!initResult.success) {
      console.error('会话初始化失败:', initResult.error);
      return NextResponse.json(
        { error: initResult.error || 'Failed to initialize streaming session' },
        { status: 500 }
      );
    }

    const response = {
      success: true,
      sessionId: sessionId,
      language: language || 'auto',
      model: model || 'base',
      message: 'Streaming session initialized'
    };

    console.log(`返回会话初始化响应:`, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('初始化流式会话错误:', error);
    return NextResponse.json(
      { error: `Failed to initialize streaming session: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// 结束流式会话
export async function DELETE(request: NextRequest) {
  try {
    console.log('收到流式会话结束请求');
    
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('JSON解析失败:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { sessionId } = body;
    
    if (!sessionId) {
      console.error('缺少会话ID');
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    console.log(`结束流式会话: ${sessionId}`);
    
    const whisperService = getWhisperService();
    
    // 清理流式会话
    const cleanupResult = await whisperService.cleanupStreamingSession(sessionId);

    console.log(`会话清理结果:`, cleanupResult);

    return NextResponse.json({
      success: true,
      sessionId: sessionId,
      message: 'Streaming session ended',
      finalResult: cleanupResult.finalResult
    });
  } catch (error) {
    console.error('结束流式会话错误:', error);
    return NextResponse.json(
      { error: `Failed to end streaming session: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}