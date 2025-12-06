import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../postgres';
import { logger } from '../../utils/logger';

const runMigrations = async () => {
  try {
    logger.info('Running migrations...');
    
    const migrationFile = readFileSync(
      join(__dirname, '001_initial_schema.sql'),
      'utf-8'
    );
    
    await query(migrationFile);
    
    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { runMigrations };

