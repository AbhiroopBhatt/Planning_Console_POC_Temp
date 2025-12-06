import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config();

const POSTGRES_HOST = process.env.POSTGRES_HOST || '127.0.0.1';
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
const POSTGRES_DB = 'pc_postgres_db';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';

async function refreshDuckDB() {
  try {
    const { Database } = require('duckdb');
    const dbPath = process.env.DUCKDB_PATH || path.join(process.cwd(), 'duckdb', 'planning_console.duckdb');
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    logger.info(`Connecting to DuckDB at: ${dbPath}`);
    const db = new Database(dbPath);
    
    // Get a connection
    const conn = db.connect();
    
    logger.info('Installing postgres extension...');
    await new Promise<void>((resolve, reject) => {
      conn.run("INSTALL postgres;", (err: Error | null) => {
        if (err && !err.message.includes('already installed')) {
          logger.warn('Postgres extension install warning:', err.message);
        }
        resolve();
      });
    });

    logger.info('Loading postgres extension...');
    await new Promise<void>((resolve, reject) => {
      conn.run("LOAD postgres;", (err: Error | null) => {
        if (err && !err.message.includes('already loaded')) {
          logger.warn('Postgres extension load warning:', err.message);
        }
        resolve();
      });
    });

    const escapedPassword = POSTGRES_PASSWORD.replace(/:/g, '%3A').replace(/@/g, '%40').replace(/\//g, '%2F');
    const connString = `postgresql://${POSTGRES_USER}:${escapedPassword}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
    
    logger.info('Refreshing fact_base_volume table in DuckDB...');
    await new Promise<void>((resolve, reject) => {
      conn.run(`DROP TABLE IF EXISTS fact_base_volume;`, (err: Error | null) => {
        if (err) {
          logger.warn('Drop table warning:', err.message);
        }
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      conn.run(`CREATE TABLE fact_base_volume AS SELECT * FROM postgres_scan('${connString}', 'public', 'fact_base_volume');`, (err: Error | null) => {
        if (err) {
          logger.error('Error creating fact_base_volume table:', err);
          reject(err);
        } else {
          logger.info('Successfully created fact_base_volume table in DuckDB');
          resolve();
        }
      });
    });

    logger.info('Refreshing Basevolume_allcombo_view...');
    // The view will be refreshed when refreshAllRollupViews is called, but for now let's just refresh the base table
    // The view uses fact_base_volume, so it should pick up the changes automatically
    
    conn.close();
    db.close();
    
    logger.info('DuckDB refresh completed successfully');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error refreshing DuckDB', error);
    process.exit(1);
  }
}

if (require.main === module) {
  refreshDuckDB();
}
