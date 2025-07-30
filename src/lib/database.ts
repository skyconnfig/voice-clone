import sqlite3 from 'sqlite3';
import { promisify } from 'util';

// 数据库接口定义
export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface AudioRecord {
  id: number;
  user_id: number;
  filename: string;
  text_content: string;
  type: 'tts' | 'stt' | 'clone';
  created_at: string;
}

export interface VoiceModel {
  id: number;
  user_id: number;
  model_id: string;
  model_name: string;
  status: 'training' | 'ready' | 'failed';
  created_at: string;
}

class Database {
  private db: sqlite3.Database;
  private ready: Promise<void>;

  constructor() {
    const dbPath = process.env.DATABASE_URL || './voice_clone.db';
    this.db = new sqlite3.Database(dbPath);
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    try {
      // 创建用户表
      await run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建音频记录表
      await run(`
        CREATE TABLE IF NOT EXISTS audio_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          text_content TEXT,
          type TEXT CHECK(type IN ('tts', 'stt', 'clone')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      // 创建声音模型表
      await run(`
        CREATE TABLE IF NOT EXISTS voice_models (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          model_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          status TEXT CHECK(status IN ('training', 'ready', 'failed')) DEFAULT 'training',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `);

      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  async waitForReady(): Promise<void> {
    await this.ready;
  }

  // 用户相关操作
  async createUser(username: string): Promise<User> {
    await this.waitForReady();
    const run = promisify(this.db.run.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));

    try {
      const result = await run('INSERT INTO users (username) VALUES (?)', [username]);
      const user = await get('SELECT * FROM users WHERE id = ?', [result.lastID]) as User;
      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error}`);
    }
  }

  async getUser(id: number): Promise<User | null> {
    await this.waitForReady();
    const get = promisify(this.db.get.bind(this.db));
    
    try {
      const user = await get('SELECT * FROM users WHERE id = ?', [id]) as User | undefined;
      return user || null;
    } catch (error) {
      throw new Error(`Failed to get user: ${error}`);
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    await this.waitForReady();
    const get = promisify(this.db.get.bind(this.db));
    
    try {
      const user = await get('SELECT * FROM users WHERE username = ?', [username]) as User | undefined;
      return user || null;
    } catch (error) {
      throw new Error(`Failed to get user by username: ${error}`);
    }
  }

  // 音频记录相关操作
  async createAudioRecord(record: Omit<AudioRecord, 'id' | 'created_at'>): Promise<AudioRecord> {
    await this.waitForReady();
    const get = promisify(this.db.get.bind(this.db));

    try {
      const result = await new Promise<sqlite3.RunResult>((resolve, reject) => {
        this.db.run(
          'INSERT INTO audio_records (user_id, filename, text_content, type) VALUES (?, ?, ?, ?)',
          [record.user_id, record.filename, record.text_content, record.type],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      
      const audioRecord = await new Promise<AudioRecord>((resolve, reject) => {
        this.db.get('SELECT * FROM audio_records WHERE id = ?', [result.lastID], (err, row) => {
          if (err) reject(err);
          else resolve(row as AudioRecord);
        });
      });
      return audioRecord;
    } catch (error) {
      throw new Error(`Failed to create audio record: ${error}`);
    }
  }

  async getAudioRecords(userId: number, type?: string): Promise<AudioRecord[]> {
    await this.waitForReady();
    
    try {
      let query = 'SELECT * FROM audio_records WHERE user_id = ?';
      const params: (number | string)[] = [userId];
      
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      
      query += ' ORDER BY created_at DESC';
      
      const records = await new Promise<AudioRecord[]>((resolve, reject) => {
        this.db.all(query, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows as AudioRecord[]);
        });
      });
      return records;
    } catch (error) {
      throw new Error(`Failed to get audio records: ${error}`);
    }
  }

  // 声音模型相关操作
  async createVoiceModel(model: Omit<VoiceModel, 'id' | 'created_at'>): Promise<VoiceModel> {
    await this.waitForReady();

    try {
      const result = await new Promise<sqlite3.RunResult>((resolve, reject) => {
        this.db.run(
          'INSERT INTO voice_models (user_id, model_id, model_name, status) VALUES (?, ?, ?, ?)',
          [model.user_id, model.model_id, model.model_name, model.status],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
      
      const voiceModel = await new Promise<VoiceModel>((resolve, reject) => {
        this.db.get('SELECT * FROM voice_models WHERE id = ?', [result.lastID], (err, row) => {
          if (err) reject(err);
          else resolve(row as VoiceModel);
        });
      });
      return voiceModel;
    } catch (error) {
      throw new Error(`Failed to create voice model: ${error}`);
    }
  }

  async getVoiceModels(userId: number): Promise<VoiceModel[]> {
    await this.waitForReady();
    
    try {
      const models = await new Promise<VoiceModel[]>((resolve, reject) => {
        this.db.all(
          'SELECT * FROM voice_models WHERE user_id = ? ORDER BY created_at DESC',
          [userId],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows as VoiceModel[]);
          }
        );
      });
      return models;
    } catch (error) {
      throw new Error(`Failed to get voice models: ${error}`);
    }
  }

  async updateVoiceModelStatus(id: number, status: VoiceModel['status']): Promise<void> {
    await this.waitForReady();
    
    try {
      await new Promise<void>((resolve, reject) => {
        this.db.run('UPDATE voice_models SET status = ? WHERE id = ?', [status, id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      throw new Error(`Failed to update voice model status: ${error}`);
    }
  }

  async deleteVoiceModel(id: number): Promise<void> {
    await this.waitForReady();
    
    try {
      await new Promise<void>((resolve, reject) => {
        this.db.run('DELETE FROM voice_models WHERE id = ?', [id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      throw new Error(`Failed to delete voice model: ${error}`);
    }
  }

  // 关闭数据库连接
  async close(): Promise<void> {
    await this.waitForReady();
    const close = promisify(this.db.close.bind(this.db));
    await close();
  }
}

// 创建单例数据库实例
let dbInstance: Database;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

// 导出类型和函数
export { Database };
export default getDatabase;