import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger';

const execAsync = promisify(exec);

export async function dockerExecQuery(
  database: string,
  query: string
): Promise<any[]> {
  try {
    const { stdout, stderr } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d ${database} -t -A -c "${query.replace(/"/g, '\\"')}"`
    );
    
    if (stderr && !stderr.includes('Pager')) {
      throw new Error(stderr);
    }
    
    // Parse the output
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    return lines;
  } catch (error: any) {
    logger.error('Docker exec query failed', error);
    throw error;
  }
}

export async function dockerExecQueryJSON(
  database: string,
  query: string
): Promise<any[]> {
  try {
    const { stdout, stderr } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d ${database} -t -A -F',' -c "${query.replace(/"/g, '\\"')}"`
    );
    
    if (stderr && !stderr.includes('Pager')) {
      throw new Error(stderr);
    }
    
    // For now, return raw lines - we'll parse in the controller
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    return lines;
  } catch (error: any) {
    logger.error('Docker exec query failed', error);
    throw error;
  }
}

