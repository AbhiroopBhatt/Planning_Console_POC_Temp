import { getSession, getDatabase } from '../db/neo4j';
import { logger } from './logger';

export async function testNeo4jConnection(): Promise<boolean> {
  try {
    const session = getSession();
    const db = getDatabase();
    
    const result = await session.run('RETURN 1 as test');
    await session.close();
    
    logger.info(`Neo4j connection test successful for database: ${db}`);
    return true;
  } catch (error) {
    logger.error('Neo4j connection test failed', error);
    return false;
  }
}

