import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../../utils/logger';

dotenv.config();

const runMigration = async () => {
  // Connect to default postgres database to create new database
  const adminPool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'postgres', // Connect to default database
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });

  try {
    logger.info('Creating database pc_postgres_db...');
    
    // Create database if it doesn't exist
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'pc_postgres_db' AND pid <> pg_backend_pid();
    `).catch(() => {}); // Ignore errors if no connections exist

    await adminPool.query('CREATE DATABASE pc_postgres_db').catch((err: any) => {
      if (err.code === '42P04') {
        logger.info('Database pc_postgres_db already exists');
      } else {
        throw err;
      }
    });

    await adminPool.end();

    // Now connect to the new database and run schema
    const dbPool = new Pool({
      host: process.env.POSTGRES_HOST || '127.0.0.1',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: 'pc_postgres_db',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
    });

    logger.info('Running schema migration...');
    const schemaFile = readFileSync(
      join(__dirname, '002_pc_postgres_schema.sql'),
      'utf-8'
    );
    
    await dbPool.query(schemaFile);
    
    logger.info('Schema migration completed successfully');
    await dbPool.end();
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  }
};

if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { runMigration };

