import dotenv from 'dotenv';
import { refreshAllRollupViews, isAvailable, getDatabase } from './duckdb';
import { logger } from '../utils/logger';

dotenv.config();

async function refreshDuckDB() {
  try {
    // Wait a bit for DuckDB to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!isAvailable()) {
      logger.error('DuckDB is not available');
      process.exit(1);
    }
    
    const db = getDatabase();
    if (!db) {
      logger.error('DuckDB database instance is not available');
      process.exit(1);
    }
    
    // Ensure we have a connection by running a simple query
    await new Promise<void>((resolve, reject) => {
      db.run('SELECT 1', (err: Error | null) => {
        if (err) {
          logger.warn('DuckDB connection test failed, but continuing', err);
        }
        resolve();
      });
    });
    
    logger.info('Refreshing DuckDB views from PostgreSQL...');
    await refreshAllRollupViews();
    logger.info('DuckDB views refreshed successfully');
    
    // Wait a bit before exiting to ensure all operations complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(0);
  } catch (error: any) {
    logger.error('Error refreshing DuckDB views', error);
    process.exit(1);
  }
}

if (require.main === module) {
  refreshDuckDB();
}
