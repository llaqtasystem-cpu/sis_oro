import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'async_hooks';

dotenv.config();

// Create active transaction thread-local storage context
const activeTransactionStorage = new AsyncLocalStorage<DB>();

// Helper to sanitize parameters by replacing undefined with null for MySQL/SQLite consistency
function sanitizeParams(params: any[] = []): any[] {
  return params.map(val => val === undefined ? null : val);
}

export interface DB {
  query(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  get(sql: string, params?: any[]): Promise<any>;
  run(sql: string, params?: any[]): Promise<{ lastInsertRowid?: number | string; changes: number }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  isMySQL: boolean;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
}

class MySQLWrapper implements DB {
  isMySQL = true;
  constructor(private pool: mysql.Pool) {}

  private getActive(): DB {
    const active = activeTransactionStorage.getStore();
    return active || this;
  }

  async query(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.query(sql, params);
    }
    const cleanParams = sanitizeParams(params);
    const [rows] = await this.pool.execute(sql, cleanParams);
    return rows;
  }

  async all(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.all(sql, params);
    }
    const cleanParams = sanitizeParams(params);
    const [rows] = await this.pool.execute(sql, cleanParams);
    return rows as any[];
  }

  async get(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.get(sql, params);
    }
    const cleanParams = sanitizeParams(params);
    const [rows] = await this.pool.execute(sql, cleanParams) as any[];
    return rows && rows.length > 0 ? rows[0] : undefined;
  }

  async run(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.run(sql, params);
    }
    const cleanParams = sanitizeParams(params);
    const [result] = await this.pool.execute(sql, cleanParams) as any;
    return {
      lastInsertRowid: result.insertId,
      changes: result.affectedRows
    };
  }

  async exec(sql: string) {
    const active = this.getActive();
    if (active !== this) {
      await active.exec(sql);
      return;
    }
    // MySQL handles multiple statements differently. For simple schema setups, we might need to split by semicolon or use specific settings.
    // However, most initial execs are multiple CREATE TABLEs.
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      await this.pool.execute(statement);
    }
  }

  async close() {
    await this.pool.end();
  }

  async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    const active = activeTransactionStorage.getStore();
    if (active) {
      // Re-use current active transaction (nested fallback)
      return fn(active);
    }

    const connection = await this.pool.getConnection();
    await connection.beginTransaction();
    const dbWrapper = new MySQLConnectionWrapper(connection);
    try {
      const result = await activeTransactionStorage.run(dbWrapper, () => fn(dbWrapper));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

// Helper for single connection transactions
class MySQLConnectionWrapper implements DB {
    isMySQL = true;
    constructor(private connection: mysql.PoolConnection) {}
    async query(sql: string, params: any[] = []) {
        const cleanParams = sanitizeParams(params);
        const [rows] = await this.connection.execute(sql, cleanParams);
        return rows;
    }
    async all(sql: string, params: any[] = []) {
        const cleanParams = sanitizeParams(params);
        const [rows] = await this.connection.execute(sql, cleanParams);
        return rows as any[];
    }
    async get(sql: string, params: any[] = []) {
        const cleanParams = sanitizeParams(params);
        const [rows] = await this.connection.execute(sql, cleanParams) as any[];
        return rows && rows.length > 0 ? rows[0] : undefined;
    }
    async run(sql: string, params: any[] = []) {
        const cleanParams = sanitizeParams(params);
        const [result] = await this.connection.execute(sql, cleanParams) as any;
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
    }
    async exec(sql: string) {
        const statements = sql.split(';').filter(s => s.trim());
        for (const statement of statements) {
          await this.connection.execute(statement);
        }
    }
    async close(): Promise<void> { /* controlled by pool */ return; }
    async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
        return await fn(this);
    }
}

class SQLiteWrapper implements DB {
  isMySQL = false;
  private db: Database.Database;
  constructor(private dbPath: string) {
    let connectionOk = false;
    try {
      this.db = new Database(dbPath);
      // Run quick check to verify the database file is readable and not malformed
      this.db.prepare("SELECT 1").get();
      connectionOk = true;
    } catch (e: any) {
      const errMsg = e?.message || "";
      if (errMsg.includes("malformed") || errMsg.includes("corrupt") || errMsg.includes("disk image is malformed")) {
        console.error(`⚠️ SQLite Database Malformed/Corrupt detected at "${dbPath}": ${errMsg}. Initiating self-healing...`);
      } else {
        throw e;
      }
    }

    if (!connectionOk) {
      try {
        if (this.db) {
          try { this.db.close(); } catch (_) {}
        }
        // Delete malformed sqlite database files
        const files = [dbPath, `${dbPath}-shm`, `${dbPath}-wal`, `${dbPath}-journal`];
        for (const f of files) {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            console.log(`Successfully removed corrupted SQLite file: ${f}`);
          }
        }
      } catch (err) {
        console.error(`Failed to delete corrupted SQLite database files at "${dbPath}":`, err);
      }
      // Recreate a clean database instance
      this.db = new Database(dbPath);
    }

    try {
      this.db.exec("PRAGMA foreign_keys = ON;");
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
    } catch (e) {
      console.warn("Could not set performance PRAGMAs in SQLite:", e);
    }
  }

  async query(sql: string, params: any[] = []) {
    const cleanParams = sanitizeParams(params);
    return this.db.prepare(this.convertSql(sql)).all(...cleanParams);
  }

  async all(sql: string, params: any[] = []) {
    const cleanParams = sanitizeParams(params);
    return this.db.prepare(this.convertSql(sql)).all(...cleanParams);
  }

  async get(sql: string, params: any[] = []) {
    const cleanParams = sanitizeParams(params);
    return this.db.prepare(this.convertSql(sql)).get(...cleanParams);
  }

  async run(sql: string, params: any[] = []) {
    const cleanParams = sanitizeParams(params);
    const result = this.db.prepare(this.convertSql(sql)).run(...cleanParams);
    return {
      lastInsertRowid: Number(result.lastInsertRowid),
      changes: result.changes
    };
  }

  async exec(sql: string) {
    this.db.exec(sql);
  }

  async close() {
    this.db.close();
  }

  async transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
    const active = activeTransactionStorage.getStore();
    if (active) {
      return fn(this);
    }
    // better-sqlite3 transactions are synchronous, but our fn is async.
    // This is tricky. Actually better-sqlite3 transaction(fn) expects fn to be sync.
    // For async fallback, we have to behave differently.
    // Let's use simple BEGIN/COMMIT for SQLite in this wrapper as it's async-interface.
    
    await this.exec('BEGIN TRANSACTION');
    try {
        const res = await activeTransactionStorage.run(this, () => fn(this));
        await this.exec('COMMIT');
        return res;
    } catch (e) {
        await this.exec('ROLLBACK');
        throw e;
    }
  }

  private convertSql(sql: string): string {
    // Basic conversion if needed (e.g. MySQL backticks to SQLite or vice versa, though both usually support them)
    // MySQL uses ? for placeholders, better-sqlite3 also uses ? or @/:
    return sql;
  }
}

export async function getDatabaseConfig() {
  const configPath = path.join(process.cwd(), 'db-config.json');
  const defaults = {
    type: 'sqlite',
    useSandbox: false,
    mysql: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'llaqta_gold',
      port: Number(process.env.DB_PORT) || 3306
    },
    sqlite: {
      path: process.env.SQLITE_DB_PATH || 'database.sqlite'
    },
    sandbox: {
      type: 'mysql',
      mysql: {
        host: process.env.DB_SANDBOX_HOST || '',
        user: process.env.DB_SANDBOX_USER || '',
        password: process.env.DB_SANDBOX_PASSWORD || '',
        database: process.env.DB_SANDBOX_NAME || 'llaqta_gold_sandbox',
        port: Number(process.env.DB_SANDBOX_PORT) || 3306
      },
      sqlite: {
        path: 'sandbox.sqlite'
      }
    }
  };

  let config = { ...defaults };

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const loaded = JSON.parse(content);
      config = {
        ...defaults,
        ...loaded,
        mysql: { ...defaults.mysql, ...(loaded.mysql || {}) },
        sqlite: { ...defaults.sqlite, ...(loaded.sqlite || {}) },
        sandbox: { 
          ...defaults.sandbox, 
          ...(loaded.sandbox || {}),
          mysql: { ...defaults.sandbox.mysql, ...((loaded.sandbox && loaded.sandbox.mysql) || {}) },
          sqlite: { ...defaults.sandbox.sqlite, ...((loaded.sandbox && loaded.sandbox.sqlite) || {}) }
        }
      };
    } catch (e: any) {
      console.log('ℹ️ [Database Config] Reading db-config.json default mappings.', e ? (e.message || e) : '');
    }
  }

  // Environment variables precedence (if set)
  if (process.env.DB_HOST) config.mysql.host = process.env.DB_HOST;
  if (process.env.DB_USER) config.mysql.user = process.env.DB_USER;
  if (process.env.DB_PASSWORD !== undefined) config.mysql.password = process.env.DB_PASSWORD;
  if (process.env.DB_NAME) config.mysql.database = process.env.DB_NAME;
  if (process.env.DB_PORT) config.mysql.port = Number(process.env.DB_PORT) || 3306;
  if (process.env.SQLITE_DB_PATH) config.sqlite.path = process.env.SQLITE_DB_PATH;

  if (process.env.DB_SANDBOX_HOST) config.sandbox.mysql.host = process.env.DB_SANDBOX_HOST;
  if (process.env.DB_SANDBOX_USER) config.sandbox.mysql.user = process.env.DB_SANDBOX_USER;
  if (process.env.DB_SANDBOX_PASSWORD !== undefined) config.sandbox.mysql.password = process.env.DB_SANDBOX_PASSWORD;
  if (process.env.DB_SANDBOX_NAME) config.sandbox.mysql.database = process.env.DB_SANDBOX_NAME;
  if (process.env.DB_SANDBOX_PORT) config.sandbox.mysql.port = Number(process.env.DB_SANDBOX_PORT) || 3306;

  return config;
}

export async function saveDatabaseConfig(config: any) {
  const configPath = path.join(process.cwd(), 'db-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export async function initDatabase(): Promise<DB> {
  const config = await getDatabaseConfig();
  const isSandboxActive = !!config.useSandbox;
  const activeType = isSandboxActive ? (config.sandbox?.type || 'mysql') : config.type;

  if (isSandboxActive) {
    console.log('🤖 --- ENTRANDO EN MODO PRUEBAS / SANDBOX DATABASE ---');
  }

  if (activeType === 'mysql') {
    const activeMysql = isSandboxActive ? config.sandbox?.mysql : config.mysql;
    const host = activeMysql?.host || 'localhost';
    const database = activeMysql?.database || 'llaqta_gold';
    const user = activeMysql?.user || 'root';
    const password = activeMysql?.password || '';
    const port = Number(activeMysql?.port) || 3306;

    const isPlaceholderHost = !host || host.includes('example.com') || host.includes('example');

    if (isPlaceholderHost) {
      console.log(`ℹ️ [Database] El host de MySQL es un marcador de posición (${host || 'vacío'}). Usando SQLite de forma directa.`);
    } else {
      console.log(`Using ${isSandboxActive ? 'SANDBOX ' : ''}MySQL database:`, host, database);
      try {
        const pool = mysql.createPool({
          host,
          user,
          password,
          database,
          port,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          connectTimeout: 2000 // 2 seconds timeout to fallback immediately if host is unreachable
        });
        // Test the pool
        await pool.query('SELECT 1');
        return new MySQLWrapper(pool);
      } catch (error: any) {
        console.log(`ℹ️ [Database Connection] ${isSandboxActive ? 'SANDBOX ' : ''}MySQL is currently offline. Initializing local SQLite database storage as the primary option.`);
      }
    }
  }

  const activeSqlite = isSandboxActive ? config.sandbox?.sqlite : config.sqlite;
  const sqlitePath = activeSqlite?.path || (isSandboxActive ? 'sandbox.sqlite' : 'database.sqlite');
  console.log(`Using ${isSandboxActive ? 'SANDBOX ' : ''}SQLite database:`, sqlitePath);
  return new SQLiteWrapper(sqlitePath);
}
