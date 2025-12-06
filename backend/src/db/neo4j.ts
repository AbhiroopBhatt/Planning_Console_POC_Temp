import neo4j, { Driver, Session } from 'neo4j-driver';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const uri = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'planning_console_neo4j_2024';
const database = process.env.NEO4J_DATABASE || 'pc-neo4j-poc';

export const driver: Driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

// Verify connectivity
driver.verifyConnectivity()
  .then(() => {
    logger.info(`Connected to Neo4j database: ${database}`);
  })
  .catch((error) => {
    logger.error('Failed to connect to Neo4j', error);
  });

export const getSession = (db?: string): Session => {
  return driver.session({ database: db || database });
};

export const closeDriver = async () => {
  await driver.close();
};

export const getDatabase = (): string => {
  return database;
};

/**
 * Clear all nodes and relationships from Neo4j
 */
export async function clearAllNeo4jData(): Promise<void> {
  const session = getSession();
  try {
    logger.info('Clearing all Neo4j nodes and relationships...');
    
    // Delete all relationships first
    const deleteRelationshipsResult = await session.run(`
      MATCH ()-[r]->()
      DELETE r
    `);
    logger.info(`Deleted ${deleteRelationshipsResult.summary.counters.updates().relationshipsDeleted} relationships`);

    // Delete all nodes
    const deleteNodesResult = await session.run(`
      MATCH (n)
      DELETE n
    `);
    logger.info(`Deleted ${deleteNodesResult.summary.counters.updates().nodesDeleted} nodes`);

    logger.info('Successfully cleared all Neo4j data');
  } catch (error: any) {
    logger.error('Error clearing Neo4j data', error);
    throw error;
  } finally {
    await session.close();
  }
}
