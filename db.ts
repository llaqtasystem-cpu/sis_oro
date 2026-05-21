import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'async_hooks';

dotenv.config();

// Create active transaction thread-local storage context
const activeTransactionStorage = new AsyncLocalStorage<DB>();

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
    const [rows] = await this.pool.execute(sql, params);
    return rows;
  }

  async all(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.all(sql, params);
    }
    const [rows] = await this.pool.execute(sql, params);
    return rows as any[];
  }

  async get(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.get(sql, params);
    }
    const [rows] = await this.pool.execute(sql, params) as any[];
    return rows && rows.length > 0 ? rows[0] : undefined;
  }

  async run(sql: string, params: any[] = []) {
    const active = this.getActive();
    if (active !== this) {
      return active.run(sql, params);
    }
    const [result] = await this.pool.execute(sql, params) as any;
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
        const [rows] = await this.connection.execute(sql, params);
        return rows;
    }
    async all(sql: string, params: any[] = []) {
        const [rows] = await this.connection.execute(sql, params);
        return rows as any[];
    }
    async get(sql: string, params: any[] = []) {
        const [rows] = await this.connection.execute(sql, params) as any[];
        return rows && rows.length > 0 ? rows[0] : undefined;
    }
    async run(sql: string, params: any[] = []) {
        const [result] = await this.connection.execute(sql, params) as any;
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
  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  async query(sql: string, params: any[] = []) {
    return this.db.prepare(this.convertSql(sql)).all(...params);
  }

  async all(sql: string, params: any[] = []) {
    return this.db.prepare(this.convertSql(sql)).all(...params);
  }

  async get(sql: string, params: any[] = []) {
    return this.db.prepare(this.convertSql(sql)).get(...params);
  }

  async run(sql: string, params: any[] = []) {
    const result = this.db.prepare(this.convertSql(sql)).run(...params);
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
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Error reading db-config.json', e);
    }
  }
  return {
    type: process.env.DB_TYPE || (process.env.DB_HOST ? 'mysql' : 'sqlite'),
    mysql: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'llaqta_gold',
      port: Number(process.env.DB_PORT) || 3306
    },
    sqlite: {
      path: process.env.SQLITE_DB_PATH || 'database.sqlite'
    }
  };
}

export async function saveDatabaseConfig(config: any) {
  const configPath = path.join(process.cwd(), 'db-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export async function initDatabase(): Promise<DB> {
  const config = await getDatabaseConfig();
  if (config.type === 'mysql') {
    console.log('Using MySQL database:', config.mysql.host, config.mysql.database);
    try {
      const pool = mysql.createPool({
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        port: Number(config.mysql.port) || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      // Test the pool
      await pool.query('SELECT 1');
      return new MySQLWrapper(pool);
    } catch (error) {
      console.error('MySQL connection failed. Falling back to SQLite.', error);
    }
  }
  console.log('Using SQLite database:', config.sqlite.path);
  return new SQLiteWrapper(config.sqlite.path);
}
