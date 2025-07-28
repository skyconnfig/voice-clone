import { NextRequest, NextResponse } from 'next/server';
import { getFishAudioClient } from '@/lib/fish-audio';
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

// 最大文件大小 (100MB for voice cloning)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// 最小音频时长 (10秒)
const MIN_DURATION_MS = 10000;

// 最大音频时长 (5分钟)
const MAX_DURATION_MS = 300000;

export async function POST(request: NextRequest) {
  try {
    // 解析multipart/form-data
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const modelName = formData.get('name') as string;
    const description = formData.get('description') as string;
    const userId = parseInt(formData.get('user_id') as string) || 1;

    // 输入验证
    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    if (!modelName || modelName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Model name is required' },
        { status: 400 }
      );
    }

    if (modelName.length > 100) {
      return NextResponse.json(
        { error: 'Model name too long. Maximum 100 characters allowed' },
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

    console.log('Voice clone request:', {
      filename: audioFile.name,
      size: audioFile.size,
      type: audioFile.type,
      modelName,
      description,
      userId,
    });

    // 将文件转换为Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 调用Fish Audio克隆服务
    const fishAudio = getFishAudioClient();
    const cloneResult = await fishAudio.cloneVoice({
      audio_file: audioBuffer,
      name: modelName.trim(),
      description: description?.trim(),
    });

    if (!cloneResult.success) {
      console.error('Voice clone failed:', cloneResult.error);
      return NextResponse.json(
        { error: cloneResult.error || 'Voice cloning failed' },
        { status: 500 }
      );
    }

    // 保存声音模型记录到数据库
    try {
      const db = getDatabase();
      const voiceModel = await db.createVoiceModel({
        user_id: userId,
        model_id: cloneResult.model_id!,
        model_name: modelName.trim(),
        status: cloneResult.status || 'training',
      });

      console.log('Voice model record saved:', voiceModel);

      // 同时保存音频记录
      const filename = `clone_${Date.now()}_${userId}_${audioFile.name}`;
      await db.createAudioRecord({
        user_id: userId,
        filename: filename,
        text_content: `Voice clone model: ${modelName}`,
        type: 'clone',
      });

      return NextResponse.json({
        success: true,
        model_id: cloneResult.model_id,
        model_name: modelName.trim(),
        status: cloneResult.status,
        message: 'Voice cloning initiated successfully',
        database_id: voiceModel.id,
      });
    } catch (dbError) {
      console.error('Failed to save voice model record:', dbError);
      // 即使数据库保存失败，也返回克隆成功的结果
      return NextResponse.json({
        success: true,
        model_id: cloneResult.model_id,
        model_name: modelName.trim(),
        status: cloneResult.status,
        message: 'Voice cloning initiated successfully (database save failed)',
        warning: 'Failed to save record to database',
      });
    }
  } catch (error) {
    console.error('Clone API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = parseInt(searchParams.get('user_id') || '1');
    const modelId = searchParams.get('model_id');

    // 如果提供了model_id，检查特定模型状态
    if (modelId) {
      const fishAudio = getFishAudioClient();
      const statusResult = await fishAudio.checkModelStatus(modelId);
      
      // 同时从数据库获取模型信息
      try {
        const db = getDatabase();
        const models = await db.getVoiceModels(userId);
        const model = models.find(m => m.model_id === modelId);
        
        if (model && statusResult.status !== model.status) {
          // 更新数据库中的状态
          await db.updateVoiceModelStatus(model.id, statusResult.status as any);
        }

        return NextResponse.json({
          success: true,
          model_id: modelId,
          status: statusResult.status,
          ready: statusResult.ready,
          model_info: model,
        });
      } catch (dbError) {
        console.error('Database error when checking model status:', dbError);
        return NextResponse.json({
          success: true,
          model_id: modelId,
          status: statusResult.status,
          ready: statusResult.ready,
        });
      }
    }

    // 获取用户的所有声音模型
    try {
      const db = getDatabase();
      const models = await db.getVoiceModels(userId);

      // 检查每个模型的最新状态
      const fishAudio = getFishAudioClient();
      const modelsWithStatus = await Promise.all(
        models.map(async (model) => {
          try {
            const statusResult = await fishAudio.checkModelStatus(model.model_id);
            
            // 如果状态有变化，更新数据库
            if (statusResult.status !== model.status) {
              await db.updateVoiceModelStatus(model.id, statusResult.status as any);
              model.status = statusResult.status as any;
            }
            
            return {
              ...model,
              ready: statusResult.ready,
              last_checked: new Date().toISOString(),
            };
          } catch (error) {
            console.error(`Failed to check status for model ${model.model_id}:`, error);
            return {
              ...model,
              ready: model.status === 'ready',
              last_checked: new Date().toISOString(),
              error: 'Failed to check status',
            };
          }
        })
      );

      return NextResponse.json({
        success: true,
        models: modelsWithStatus,
        total: modelsWithStatus.length,
      });
    } catch (dbError) {
      console.error('Failed to get voice models:', dbError);
      return NextResponse.json(
        { error: 'Failed to get voice models from database' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Get voice models error:', error);
    return NextResponse.json(
      { error: 'Failed to get voice models' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('model_id');
    const userId = parseInt(searchParams.get('user_id') || '1');
    const databaseId = parseInt(searchParams.get('id') || '0');

    if (!modelId && !databaseId) {
      return NextResponse.json(
        { error: 'Model ID or database ID is required' },
        { status: 400 }
      );
    }

    try {
      const db = getDatabase();
      let modelToDelete;

      if (databaseId) {
        // 通过数据库ID删除
        const models = await db.getVoiceModels(userId);
        modelToDelete = models.find(m => m.id === databaseId);
      } else if (modelId) {
        // 通过模型ID删除
        const models = await db.getVoiceModels(userId);
        modelToDelete = models.find(m => m.model_id === modelId);
      }

      if (!modelToDelete) {
        return NextResponse.json(
          { error: 'Voice model not found' },
          { status: 404 }
        );
      }

      // 从数据库中删除记录
      await db.deleteVoiceModel(modelToDelete.id);

      console.log('Voice model deleted:', modelToDelete.model_id);

      return NextResponse.json({
        success: true,
        message: 'Voice model deleted successfully',
        deleted_model: {
          id: modelToDelete.id,
          model_id: modelToDelete.model_id,
          model_name: modelToDelete.model_name,
        },
      });
    } catch (dbError) {
      console.error('Failed to delete voice model:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete voice model from database' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Delete voice model error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}