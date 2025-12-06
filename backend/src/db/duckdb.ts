import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { query as pgQuery } from './postgres';
import { getSession } from './neo4j';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config();

let db: any = null;
let duckdbAvailable = false;

// PostgreSQL connection details for DuckDB
// Use the same configuration as the backend postgres.ts
// Note: The database name should match what's actually in PostgreSQL
const POSTGRES_HOST = process.env.POSTGRES_HOST || '127.0.0.1';
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
// Use the same database as the backend postgres.ts
// Default to 'pc_postgres_db' to match the actual database name
const POSTGRES_DB = process.env.POSTGRES_DB || 'pc_postgres_db';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'postgres';

// Try to detect if we're in Docker and use container hostname
// For now, use 127.0.0.1 as DuckDB runs in the same process as the backend

// Neo4j connection details
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'planning_console_neo4j_2024';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || 'pc-neo4j-poc';

// Try to load DuckDB, but make it optional
try {
  const { Database } = require('duckdb');
  const dbPath = process.env.DUCKDB_PATH || path.join(process.cwd(), 'duckdb', 'planning_console.duckdb');
  const dbDir = path.dirname(dbPath);

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  duckdbAvailable = true;
  logger.info(`DuckDB initialized successfully at: ${dbPath}`);
  
  // Initialize connections on startup (async, don't wait)
  initializeConnections().catch((err) => {
    logger.warn('DuckDB connection initialization had issues, but DuckDB is available', err);
  });
} catch (error: any) {
  logger.warn('DuckDB not available, falling back to PostgreSQL for semantic layer', {
    message: error.message,
    stack: error.stack
  });
  duckdbAvailable = false;
}

/**
 * Initialize PostgreSQL and Neo4j connections in DuckDB
 */
async function initializeConnections(): Promise<void> {
  if (!duckdbAvailable || !db) {
    return;
  }

  try {
    // Install and load postgres extension
    await new Promise<void>((resolve) => {
      db.run("INSTALL postgres;", (err: Error | null) => {
        if (err) {
          logger.warn('Failed to install postgres extension (may already be installed)', err);
        } else {
          logger.info('PostgreSQL extension installed in DuckDB');
        }
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      db.run("LOAD postgres;", (err: Error | null) => {
        if (err) {
          logger.warn('Failed to load postgres extension (may already be loaded)', err);
        } else {
          logger.info('PostgreSQL extension loaded in DuckDB');
        }
        resolve();
      });
    });

    logger.info('PostgreSQL extension ready. Connection will be tested on first query.');
  } catch (error: any) {
    logger.warn('Error initializing DuckDB connections', error);
  }
}

/**
 * Check if DuckDB is available
 */
export function isAvailable(): boolean {
  return duckdbAvailable && db !== null;
}

/**
 * Get database instance
 */
export function getDatabase(): any {
  return db;
}

/**
 * Execute a SQL query and return results
 */
export const query = async (sql: string, params?: any[]): Promise<any[]> => {
  if (!duckdbAvailable || !db) {
    // Fallback to PostgreSQL
    logger.debug('Using PostgreSQL fallback for DuckDB query');
    try {
      const result = await pgQuery(sql, params);
      return result.rows || [];
    } catch (error: any) {
      logger.error('PostgreSQL fallback query failed', error);
      throw error;
    }
  }

  return new Promise((resolve, reject) => {
    // DuckDB's all() method signature: all(sql, callback) or all(sql, params, callback)
    // But it doesn't accept an empty array - only pass params if they exist and have values
    if (params && params.length > 0) {
      db.all(sql, params, (err: Error | null, rows: any[]) => {
        if (err) {
          logger.error('DuckDB query error', { sql, error: err.message });
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    } else {
      db.all(sql, (err: Error | null, rows: any[]) => {
        if (err) {
          logger.error('DuckDB query error', { sql, error: err.message });
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    }
  });
};

/**
 * Execute a SQL statement (no return value)
 * Note: DuckDB's run() method only accepts SQL string, not parameters
 * For parameterized queries, use query() instead
 */
export const run = async (sql: string, params?: any[]): Promise<void> => {
  if (!duckdbAvailable || !db) {
    // Fallback to PostgreSQL
    logger.debug('Using PostgreSQL fallback for DuckDB run');
    try {
      await pgQuery(sql, params);
      return;
    } catch (error: any) {
      logger.error('PostgreSQL fallback run failed', error);
      throw error;
    }
  }

  // If parameters are provided, we need to interpolate them into the SQL
  // (DuckDB's run() doesn't support parameterized queries)
  let finalSql = sql;
  if (params && params.length > 0) {
    // Simple parameter substitution (for safety, only use this with trusted inputs)
    params.forEach((param, index) => {
      const placeholder = `$${index + 1}`;
      const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
      finalSql = finalSql.replace(placeholder, value);
    });
  }

  return new Promise((resolve, reject) => {
    // DuckDB's run() method signature: run(sql, callback)
    // It does NOT accept a parameters array
    db.run(finalSql, (err: Error | null) => {
      if (err) {
        logger.error('DuckDB run error', { sql: finalSql, error: err.message });
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Test PostgreSQL connection from DuckDB
 */
export async function testPostgresConnection(): Promise<boolean> {
  if (!duckdbAvailable || !db) {
    return false;
  }

  try {
    // Build connection string
    const connString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
    
    // Test connection with a simple query
    const result = await query(`SELECT 1 as test FROM postgres_scan('${connString}', 'public', 'customer_h') LIMIT 1`);
    return result.length >= 0; // Even if empty, connection worked
  } catch (error: any) {
    logger.warn('PostgreSQL connection test failed', error);
    return false;
  }
}

/**
 * Test Neo4j connection
 */
export async function testNeo4jConnection(): Promise<boolean> {
  try {
    const session = getSession();
    const result = await session.run('RETURN 1 as test');
    await session.close();
    return result.records.length > 0;
  } catch (error: any) {
    logger.warn('Neo4j connection test failed', error);
    return false;
  }
}

/**
 * Create a view from PostgreSQL table
 */
export async function createPostgresView(
  tableName: string,
  schema: string = 'public',
  viewName?: string
): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  const finalViewName = viewName || `${tableName}_view`;
  const connString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
  
  await run(`DROP VIEW IF EXISTS ${finalViewName};`);
  await run(`CREATE VIEW ${finalViewName} AS SELECT * FROM postgres_scan('${connString}', '${schema}', '${tableName}');`);
  logger.info(`Created view ${finalViewName} from PostgreSQL table ${schema}.${tableName}`);
}

/**
 * Create a remote table from PostgreSQL (copies data)
 */
export async function createPostgresRemoteTable(
  tableName: string,
  schema: string = 'public',
  duckdbTableName?: string
): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  const finalTableName = duckdbTableName || tableName;
  const connString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
  
  await run(`DROP TABLE IF EXISTS ${finalTableName};`);
  await run(`CREATE TABLE ${finalTableName} AS SELECT * FROM postgres_scan('${connString}', '${schema}', '${tableName}');`);
  logger.info(`Created table ${finalTableName} from PostgreSQL table ${schema}.${tableName}`);
}

/**
 * Import data from Neo4j into DuckDB
 */
export async function importNeo4jData(
  cypherQuery: string,
  tableName: string,
  clearExisting: boolean = false
): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  try {
    const session = getSession();
    const result = await session.run(cypherQuery);
    await session.close();

    if (result.records.length === 0) {
      logger.warn(`No data returned from Neo4j query for table ${tableName}`);
      return;
    }

    // Get column names from first record
    const columns = result.records[0].keys;
    
    if (clearExisting) {
      await run(`DROP TABLE IF EXISTS ${tableName};`);
    }

    // Create table structure
    const columnDefs = columns.map((col: string) => `${col} VARCHAR`).join(', ');
    await run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs});`);

    // Insert data
    for (const record of result.records) {
      const values = columns.map((col: string) => {
        const value = record.get(col);
        return value !== null && value !== undefined ? `'${String(value).replace(/'/g, "''")}'` : 'NULL';
      }).join(', ');
      await run(`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values});`);
    }

    logger.info(`Imported ${result.records.length} records from Neo4j into ${tableName}`);
  } catch (error: any) {
    logger.error('Error importing Neo4j data', error);
    throw error;
  }
}

/**
 * Refresh all hierarchy rollup views
 * Creates customer_rollup, category_rollup, brand_rollup, region_rollup
 */
export async function refreshAllRollupViews(): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  try {
    logger.info('Refreshing all rollup views...');

    // Ensure we have the necessary tables from PostgreSQL
    // Escape special characters in password for connection string
    // Override database name to use pc_postgres_db (the actual database name)
    const escapedPassword = POSTGRES_PASSWORD.replace(/:/g, '%3A').replace(/@/g, '%40').replace(/\//g, '%2F');
    const dbName = 'pc_postgres_db'; // Use actual database name instead of POSTGRES_DB env var
    const connString = `postgresql://${POSTGRES_USER}:${escapedPassword}@${POSTGRES_HOST}:${POSTGRES_PORT}/${dbName}`;
    
    // Create/refresh customer_rollup view
    // First, create a temporary table with customer hierarchy data
    // Note: PostgreSQL table names are case-sensitive when quoted, but DuckDB's postgres_scan may need lowercase
    // Ensure postgres extension is loaded
    try {
      await run(`INSTALL postgres;`);
    } catch (installError: any) {
      // May already be installed
    }
    try {
      await run(`LOAD postgres;`);
    } catch (loadError: any) {
      // May already be loaded
    }
    
    await run(`DROP TABLE IF EXISTS customer_h_temp;`);
    
    // Workaround for DuckDB postgres_scan issue with customer_h table
    // Export data from PostgreSQL and import into DuckDB using COPY
    try {
      logger.info('Attempting to create customer_h_temp using postgres_scan...');
      await run(`CREATE TABLE customer_h_temp AS SELECT customer_id, customer_name, parent_customer_id FROM postgres_scan('${connString}', 'public', 'customer_h');`);
      logger.info('Successfully created customer_h_temp using postgres_scan');
    } catch (postgresScanError: any) {
      logger.warn('postgres_scan failed, using workaround: exporting from PostgreSQL and importing into DuckDB', postgresScanError.message);
      
      // Workaround: Use docker exec to export data and import into DuckDB
      const exportCmd = `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F',' -c "SELECT customer_id, customer_name, COALESCE(parent_customer_id::text, '') FROM customer_h ORDER BY customer_id"`;
      
      try {
        const { stdout } = await execAsync(exportCmd);
        const lines = stdout.trim().split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          throw new Error('No data exported from PostgreSQL customer_h table');
        }
        
        // Create the table structure first
        await run(`CREATE TABLE customer_h_temp (customer_id INTEGER, customer_name VARCHAR, parent_customer_id INTEGER);`);
        
        // Insert data row by row
        for (const line of lines) {
          const [customer_id, customer_name, parent_customer_id] = line.split(',');
          const parentId = parent_customer_id && parent_customer_id.trim() ? parseInt(parent_customer_id.trim()) : null;
          const name = customer_name ? customer_name.replace(/'/g, "''") : '';
          await run(`INSERT INTO customer_h_temp VALUES (${parseInt(customer_id)}, '${name}', ${parentId !== null ? parentId : 'NULL'});`);
        }
        
        logger.info(`Successfully created customer_h_temp using workaround, imported ${lines.length} rows`);
      } catch (workaroundError: any) {
        logger.error('Workaround also failed', workaroundError);
        throw new Error(`Cannot create customer_h_temp: postgres_scan error: ${postgresScanError.message}, workaround error: ${workaroundError.message}`);
      }
    }
    
    await run(`DROP VIEW IF EXISTS customer_rollup;`);
    // Use iterative approach to build transitive closure (DuckDB may not fully support recursive CTEs)
    // Build up to 10 levels deep to handle deep hierarchies
    await run(`
      CREATE VIEW customer_rollup AS
      WITH 
      -- Level 0: Self-references
      level0 AS (
        SELECT customer_id as parent_id, customer_id as child_id
        FROM customer_h_temp
      ),
      -- Level 1: Direct parent-child
      level1 AS (
        SELECT parent_customer_id as parent_id, customer_id as child_id
        FROM customer_h_temp
        WHERE parent_customer_id IS NOT NULL
      ),
      -- Level 2: Grandparent-grandchild
      level2 AS (
        SELECT DISTINCT l1.parent_id, l2.child_id
        FROM level1 l1
        INNER JOIN level1 l2 ON l1.child_id = l2.parent_id
      ),
      -- Level 3: Great-grandparent-great-grandchild
      level3 AS (
        SELECT DISTINCT l2.parent_id, l3.child_id
        FROM level2 l2
        INNER JOIN level1 l3 ON l2.child_id = l3.parent_id
      ),
      -- Level 4: 4 levels deep
      level4 AS (
        SELECT DISTINCT l3.parent_id, l4.child_id
        FROM level3 l3
        INNER JOIN level1 l4 ON l3.child_id = l4.parent_id
      ),
      -- Level 5: 5 levels deep
      level5 AS (
        SELECT DISTINCT l4.parent_id, l5.child_id
        FROM level4 l4
        INNER JOIN level1 l5 ON l4.child_id = l5.parent_id
      ),
      -- Level 6: 6 levels deep
      level6 AS (
        SELECT DISTINCT l5.parent_id, l6.child_id
        FROM level5 l5
        INNER JOIN level1 l6 ON l5.child_id = l6.parent_id
      ),
      -- Level 7: 7 levels deep
      level7 AS (
        SELECT DISTINCT l6.parent_id, l7.child_id
        FROM level6 l6
        INNER JOIN level1 l7 ON l6.child_id = l7.parent_id
      ),
      -- Level 8: 8 levels deep
      level8 AS (
        SELECT DISTINCT l7.parent_id, l8.child_id
        FROM level7 l7
        INNER JOIN level1 l8 ON l7.child_id = l8.parent_id
      ),
      -- Level 9: 9 levels deep
      level9 AS (
        SELECT DISTINCT l8.parent_id, l9.child_id
        FROM level8 l8
        INNER JOIN level1 l9 ON l8.child_id = l9.parent_id
      ),
      -- Level 10: 10 levels deep
      level10 AS (
        SELECT DISTINCT l9.parent_id, l10.child_id
        FROM level9 l9
        INNER JOIN level1 l10 ON l9.child_id = l10.parent_id
      ),
      -- Combine all levels
      all_levels AS (
        SELECT parent_id, child_id FROM level0
        UNION ALL
        SELECT parent_id, child_id FROM level1
        UNION ALL
        SELECT parent_id, child_id FROM level2
        UNION ALL
        SELECT parent_id, child_id FROM level3
        UNION ALL
        SELECT parent_id, child_id FROM level4
        UNION ALL
        SELECT parent_id, child_id FROM level5
        UNION ALL
        SELECT parent_id, child_id FROM level6
        UNION ALL
        SELECT parent_id, child_id FROM level7
        UNION ALL
        SELECT parent_id, child_id FROM level8
        UNION ALL
        SELECT parent_id, child_id FROM level9
        UNION ALL
        SELECT parent_id, child_id FROM level10
      )
      SELECT DISTINCT parent_id, child_id FROM all_levels;
    `);
    logger.info('Created customer_rollup view with 10-level hierarchy support');

    // Create/refresh category_rollup view
    await run(`DROP TABLE IF EXISTS category_h_temp;`);
    try {
      await run(`CREATE TABLE category_h_temp AS SELECT category_id, category_name, parent_category_id FROM postgres_scan('${connString}', 'public', 'category_h');`);
      logger.info('Successfully created category_h_temp using postgres_scan');
    } catch (postgresScanError: any) {
      logger.warn('postgres_scan failed for category_h, using workaround', postgresScanError.message);
      const exportCmd = `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F',' -c "SELECT category_id, category_name, COALESCE(parent_category_id::text, '') FROM category_h ORDER BY category_id"`;
      const { stdout } = await execAsync(exportCmd);
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      await run(`CREATE TABLE category_h_temp (category_id INTEGER, category_name VARCHAR, parent_category_id INTEGER);`);
      for (const line of lines) {
        const [category_id, category_name, parent_category_id] = line.split(',');
        const parentId = parent_category_id && parent_category_id.trim() ? parseInt(parent_category_id.trim()) : null;
        const name = category_name ? category_name.replace(/'/g, "''") : '';
        await run(`INSERT INTO category_h_temp VALUES (${parseInt(category_id)}, '${name}', ${parentId !== null ? parentId : 'NULL'});`);
      }
      logger.info(`Successfully created category_h_temp using workaround, imported ${lines.length} rows`);
    }
    
    await run(`DROP VIEW IF EXISTS category_rollup;`);
    await run(`
      CREATE VIEW category_rollup AS
      WITH 
      -- Level 0: Self-references
      level0 AS (
        SELECT category_id as parent_id, category_id as child_id
        FROM category_h_temp
      ),
      -- Level 1: Direct parent-child
      level1 AS (
        SELECT parent_category_id as parent_id, category_id as child_id
        FROM category_h_temp
        WHERE parent_category_id IS NOT NULL
      ),
      -- Level 2-10: Transitive relationships (same pattern as customer_rollup)
      level2 AS (
        SELECT DISTINCT l1.parent_id, l2.child_id
        FROM level1 l1
        INNER JOIN level1 l2 ON l1.child_id = l2.parent_id
      ),
      level3 AS (
        SELECT DISTINCT l2.parent_id, l3.child_id
        FROM level2 l2
        INNER JOIN level1 l3 ON l2.child_id = l3.parent_id
      ),
      level4 AS (
        SELECT DISTINCT l3.parent_id, l4.child_id
        FROM level3 l3
        INNER JOIN level1 l4 ON l3.child_id = l4.parent_id
      ),
      level5 AS (
        SELECT DISTINCT l4.parent_id, l5.child_id
        FROM level4 l4
        INNER JOIN level1 l5 ON l4.child_id = l5.parent_id
      ),
      level6 AS (
        SELECT DISTINCT l5.parent_id, l6.child_id
        FROM level5 l5
        INNER JOIN level1 l6 ON l5.child_id = l6.parent_id
      ),
      level7 AS (
        SELECT DISTINCT l6.parent_id, l7.child_id
        FROM level6 l6
        INNER JOIN level1 l7 ON l6.child_id = l7.parent_id
      ),
      level8 AS (
        SELECT DISTINCT l7.parent_id, l8.child_id
        FROM level7 l7
        INNER JOIN level1 l8 ON l7.child_id = l8.parent_id
      ),
      level9 AS (
        SELECT DISTINCT l8.parent_id, l9.child_id
        FROM level8 l8
        INNER JOIN level1 l9 ON l8.child_id = l9.parent_id
      ),
      level10 AS (
        SELECT DISTINCT l9.parent_id, l10.child_id
        FROM level9 l9
        INNER JOIN level1 l10 ON l9.child_id = l10.parent_id
      ),
      all_levels AS (
        SELECT parent_id, child_id FROM level0
        UNION ALL SELECT parent_id, child_id FROM level1
        UNION ALL SELECT parent_id, child_id FROM level2
        UNION ALL SELECT parent_id, child_id FROM level3
        UNION ALL SELECT parent_id, child_id FROM level4
        UNION ALL SELECT parent_id, child_id FROM level5
        UNION ALL SELECT parent_id, child_id FROM level6
        UNION ALL SELECT parent_id, child_id FROM level7
        UNION ALL SELECT parent_id, child_id FROM level8
        UNION ALL SELECT parent_id, child_id FROM level9
        UNION ALL SELECT parent_id, child_id FROM level10
      )
      SELECT DISTINCT parent_id, child_id FROM all_levels;
    `);
    logger.info('Created category_rollup view with 10-level hierarchy support');

    // Create/refresh brand_rollup view
    await run(`DROP TABLE IF EXISTS brand_h_temp;`);
    try {
      await run(`CREATE TABLE brand_h_temp AS SELECT brand_id, brand_name, parent_brand_id FROM postgres_scan('${connString}', 'public', 'brand_h');`);
      logger.info('Successfully created brand_h_temp using postgres_scan');
    } catch (postgresScanError: any) {
      logger.warn('postgres_scan failed for brand_h, using workaround', postgresScanError.message);
      const exportCmd = `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F',' -c "SELECT brand_id, brand_name, COALESCE(parent_brand_id::text, '') FROM brand_h ORDER BY brand_id"`;
      const { stdout } = await execAsync(exportCmd);
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      await run(`CREATE TABLE brand_h_temp (brand_id INTEGER, brand_name VARCHAR, parent_brand_id INTEGER);`);
      for (const line of lines) {
        const [brand_id, brand_name, parent_brand_id] = line.split(',');
        const parentId = parent_brand_id && parent_brand_id.trim() ? parseInt(parent_brand_id.trim()) : null;
        const name = brand_name ? brand_name.replace(/'/g, "''") : '';
        await run(`INSERT INTO brand_h_temp VALUES (${parseInt(brand_id)}, '${name}', ${parentId !== null ? parentId : 'NULL'});`);
      }
      logger.info(`Successfully created brand_h_temp using workaround, imported ${lines.length} rows`);
    }
    
    await run(`DROP VIEW IF EXISTS brand_rollup;`);
    await run(`
      CREATE VIEW brand_rollup AS
      WITH 
      level0 AS (
        SELECT brand_id as parent_id, brand_id as child_id
        FROM brand_h_temp
      ),
      level1 AS (
        SELECT parent_brand_id as parent_id, brand_id as child_id
        FROM brand_h_temp
        WHERE parent_brand_id IS NOT NULL
      ),
      level2 AS (
        SELECT DISTINCT l1.parent_id, l2.child_id
        FROM level1 l1
        INNER JOIN level1 l2 ON l1.child_id = l2.parent_id
      ),
      level3 AS (
        SELECT DISTINCT l2.parent_id, l3.child_id
        FROM level2 l2
        INNER JOIN level1 l3 ON l2.child_id = l3.parent_id
      ),
      level4 AS (
        SELECT DISTINCT l3.parent_id, l4.child_id
        FROM level3 l3
        INNER JOIN level1 l4 ON l3.child_id = l4.parent_id
      ),
      level5 AS (
        SELECT DISTINCT l4.parent_id, l5.child_id
        FROM level4 l4
        INNER JOIN level1 l5 ON l4.child_id = l5.parent_id
      ),
      level6 AS (
        SELECT DISTINCT l5.parent_id, l6.child_id
        FROM level5 l5
        INNER JOIN level1 l6 ON l5.child_id = l6.parent_id
      ),
      level7 AS (
        SELECT DISTINCT l6.parent_id, l7.child_id
        FROM level6 l6
        INNER JOIN level1 l7 ON l6.child_id = l7.parent_id
      ),
      level8 AS (
        SELECT DISTINCT l7.parent_id, l8.child_id
        FROM level7 l7
        INNER JOIN level1 l8 ON l7.child_id = l8.parent_id
      ),
      level9 AS (
        SELECT DISTINCT l8.parent_id, l9.child_id
        FROM level8 l8
        INNER JOIN level1 l9 ON l8.child_id = l9.parent_id
      ),
      level10 AS (
        SELECT DISTINCT l9.parent_id, l10.child_id
        FROM level9 l9
        INNER JOIN level1 l10 ON l9.child_id = l10.parent_id
      ),
      all_levels AS (
        SELECT parent_id, child_id FROM level0
        UNION ALL SELECT parent_id, child_id FROM level1
        UNION ALL SELECT parent_id, child_id FROM level2
        UNION ALL SELECT parent_id, child_id FROM level3
        UNION ALL SELECT parent_id, child_id FROM level4
        UNION ALL SELECT parent_id, child_id FROM level5
        UNION ALL SELECT parent_id, child_id FROM level6
        UNION ALL SELECT parent_id, child_id FROM level7
        UNION ALL SELECT parent_id, child_id FROM level8
        UNION ALL SELECT parent_id, child_id FROM level9
        UNION ALL SELECT parent_id, child_id FROM level10
      )
      SELECT DISTINCT parent_id, child_id FROM all_levels;
    `);
    logger.info('Created brand_rollup view with 10-level hierarchy support');

    // Create/refresh region_rollup view
    await run(`DROP TABLE IF EXISTS region_h_temp;`);
    try {
      await run(`CREATE TABLE region_h_temp AS SELECT region_id, region_name, parent_region_id FROM postgres_scan('${connString}', 'public', 'region_h');`);
      logger.info('Successfully created region_h_temp using postgres_scan');
    } catch (postgresScanError: any) {
      logger.warn('postgres_scan failed for region_h, using workaround', postgresScanError.message);
      const exportCmd = `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F',' -c "SELECT region_id, region_name, COALESCE(parent_region_id::text, '') FROM region_h ORDER BY region_id"`;
      const { stdout } = await execAsync(exportCmd);
      const lines = stdout.trim().split('\n').filter(line => line.trim());
      await run(`CREATE TABLE region_h_temp (region_id INTEGER, region_name VARCHAR, parent_region_id INTEGER);`);
      for (const line of lines) {
        const [region_id, region_name, parent_region_id] = line.split(',');
        const parentId = parent_region_id && parent_region_id.trim() ? parseInt(parent_region_id.trim()) : null;
        const name = region_name ? region_name.replace(/'/g, "''") : '';
        await run(`INSERT INTO region_h_temp VALUES (${parseInt(region_id)}, '${name}', ${parentId !== null ? parentId : 'NULL'});`);
      }
      logger.info(`Successfully created region_h_temp using workaround, imported ${lines.length} rows`);
    }
    
    await run(`DROP VIEW IF EXISTS region_rollup;`);
    await run(`
      CREATE VIEW region_rollup AS
      WITH 
      level0 AS (
        SELECT region_id as parent_id, region_id as child_id
        FROM region_h_temp
      ),
      level1 AS (
        SELECT parent_region_id as parent_id, region_id as child_id
        FROM region_h_temp
        WHERE parent_region_id IS NOT NULL
      ),
      level2 AS (
        SELECT DISTINCT l1.parent_id, l2.child_id
        FROM level1 l1
        INNER JOIN level1 l2 ON l1.child_id = l2.parent_id
      ),
      level3 AS (
        SELECT DISTINCT l2.parent_id, l3.child_id
        FROM level2 l2
        INNER JOIN level1 l3 ON l2.child_id = l3.parent_id
      ),
      level4 AS (
        SELECT DISTINCT l3.parent_id, l4.child_id
        FROM level3 l3
        INNER JOIN level1 l4 ON l3.child_id = l4.parent_id
      ),
      level5 AS (
        SELECT DISTINCT l4.parent_id, l5.child_id
        FROM level4 l4
        INNER JOIN level1 l5 ON l4.child_id = l5.parent_id
      ),
      level6 AS (
        SELECT DISTINCT l5.parent_id, l6.child_id
        FROM level5 l5
        INNER JOIN level1 l6 ON l5.child_id = l6.parent_id
      ),
      level7 AS (
        SELECT DISTINCT l6.parent_id, l7.child_id
        FROM level6 l6
        INNER JOIN level1 l7 ON l6.child_id = l7.parent_id
      ),
      level8 AS (
        SELECT DISTINCT l7.parent_id, l8.child_id
        FROM level7 l7
        INNER JOIN level1 l8 ON l7.child_id = l8.parent_id
      ),
      level9 AS (
        SELECT DISTINCT l8.parent_id, l9.child_id
        FROM level8 l8
        INNER JOIN level1 l9 ON l8.child_id = l9.parent_id
      ),
      level10 AS (
        SELECT DISTINCT l9.parent_id, l10.child_id
        FROM level9 l9
        INNER JOIN level1 l10 ON l9.child_id = l10.parent_id
      ),
      all_levels AS (
        SELECT parent_id, child_id FROM level0
        UNION ALL SELECT parent_id, child_id FROM level1
        UNION ALL SELECT parent_id, child_id FROM level2
        UNION ALL SELECT parent_id, child_id FROM level3
        UNION ALL SELECT parent_id, child_id FROM level4
        UNION ALL SELECT parent_id, child_id FROM level5
        UNION ALL SELECT parent_id, child_id FROM level6
        UNION ALL SELECT parent_id, child_id FROM level7
        UNION ALL SELECT parent_id, child_id FROM level8
        UNION ALL SELECT parent_id, child_id FROM level9
        UNION ALL SELECT parent_id, child_id FROM level10
      )
      SELECT DISTINCT parent_id, child_id FROM all_levels;
    `);
    logger.info('Created region_rollup view with 10-level hierarchy support');

    // Create materialized tables for fact and master data
    await run(`DROP TABLE IF EXISTS fact_prices;`);
    await run(`CREATE TABLE fact_prices AS SELECT * FROM postgres_scan('${connString}', 'public', 'fact_prices');`);
    logger.info('Created fact_prices table');

    await run(`DROP TABLE IF EXISTS fact_costs;`);
    await run(`CREATE TABLE fact_costs AS SELECT * FROM postgres_scan('${connString}', 'public', 'fact_costs');`);
    logger.info('Created fact_costs table');

    await run(`DROP TABLE IF EXISTS product_m;`);
    await run(`CREATE TABLE product_m AS SELECT * FROM postgres_scan('${connString}', 'public', 'product_m');`);
    logger.info('Created product_m table');

    await run(`DROP TABLE IF EXISTS time_m;`);
    await run(`CREATE TABLE time_m AS SELECT * FROM postgres_scan('${connString}', 'public', 'time_m');`);
    logger.info('Created time_m table');

    await run(`DROP TABLE IF EXISTS fact_base_volume;`);
    await run(`CREATE TABLE fact_base_volume AS SELECT * FROM postgres_scan('${connString}', 'public', 'fact_base_volume');`);
    logger.info('Created fact_base_volume table');

    logger.info('All rollup views refreshed successfully');
  } catch (error: any) {
    logger.error('Error refreshing rollup views', error);
    throw error;
  }
}

/**
 * Create fact table views with customer rollup and drilldown
 */
export async function createFactTableViews(): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  try {
    logger.info('Creating fact table views...');

    // Check if rollup views exist
    const views = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'main' AND table_type = 'VIEW' AND table_name = 'customer_rollup'
    `);

    if (views.length === 0) {
      throw new Error('customer_rollup view does not exist. Please build the graph first in Hierarchy Management.');
    }

    // Create Prices_allcombo_view
    await run(`DROP VIEW IF EXISTS Prices_allcombo_view;`);
    await run(`
      CREATE VIEW Prices_allcombo_view AS
      WITH 
      -- Direct join: child prices mapped to parent customers
      child_prices AS (
        SELECT 
          fp.price_id,
          fp.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.child_id as rollup_customer_id,
          fp.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fp.list_price,
          fp.customer_price,
          fp.base_price,
          fp.promo_price,
          1 as has_data
        FROM fact_prices fp
        INNER JOIN customer_rollup cr ON fp.customer_id = cr.child_id
        INNER JOIN product_m p ON fp.product_id = p.product_id
        INNER JOIN time_m t ON fp.time_id = t.time_id
      ),
      -- Rollup prices: aggregated averages for parent customers
      -- This aggregates from ALL descendants (children, grandchildren, etc.), not just direct children
      rollup_prices AS (
        SELECT 
          NULL as price_id,
          fp.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.parent_id as rollup_customer_id,
          fp.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          AVG(fp.list_price) as list_price,
          AVG(fp.customer_price) as customer_price,
          AVG(fp.base_price) as base_price,
          AVG(fp.promo_price) as promo_price,
          1 as has_data
        FROM fact_prices fp
        INNER JOIN customer_rollup cr ON fp.customer_id = cr.child_id
        INNER JOIN product_m p ON fp.product_id = p.product_id
        INNER JOIN time_m t ON fp.time_id = t.time_id
        WHERE cr.parent_id != cr.child_id
        -- Only include parents that have children with data, but aggregate from all descendants
        GROUP BY 
          fp.product_id, p.sku_name, p.barcode, p.category_id, p.brand_id,
          cr.parent_id, fp.time_id, t.date, t.year, t.quarter, t.month, t.week, t.day
      ),
      -- Parent direct prices: prices for parent customers
      parent_direct_prices AS (
        SELECT 
          fp.price_id,
          fp.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          fp.customer_id,
          fp.customer_id as rollup_customer_id,
          fp.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fp.list_price,
          fp.customer_price,
          fp.base_price,
          fp.promo_price,
          1 as has_data
        FROM fact_prices fp
        INNER JOIN product_m p ON fp.product_id = p.product_id
        INNER JOIN time_m t ON fp.time_id = t.time_id
        WHERE EXISTS (
          SELECT 1 FROM customer_rollup cr 
          WHERE cr.parent_id = fp.customer_id AND cr.parent_id != cr.child_id
        )
      ),
      -- Drill-down prices: copy prices from parents to their children
      drilldown_prices AS (
        SELECT 
          NULL as price_id,
          pdp.product_id,
          pdp.sku_name,
          pdp.barcode,
          pdp.category_id,
          pdp.brand_id,
          cr.child_id as customer_id,
          cr.child_id as rollup_customer_id,
          pdp.time_id,
          pdp.date,
          pdp.year,
          pdp.quarter,
          pdp.month,
          pdp.week,
          pdp.day,
          pdp.list_price,
          pdp.customer_price,
          pdp.base_price,
          pdp.promo_price,
          1 as has_data
        FROM parent_direct_prices pdp
        INNER JOIN customer_rollup cr ON pdp.customer_id = cr.parent_id
        WHERE cr.parent_id != cr.child_id
        AND NOT EXISTS (
          SELECT 1 FROM fact_prices fp2 
          WHERE fp2.customer_id = cr.child_id 
          AND fp2.product_id = pdp.product_id 
          AND fp2.time_id = pdp.time_id
        )
      )
      SELECT * FROM child_prices
      UNION ALL
      SELECT * FROM rollup_prices
      UNION ALL
      SELECT * FROM drilldown_prices
    `);
    logger.info('Created Prices_allcombo_view');

    // Create Costs_allcombo_view
    await run(`DROP VIEW IF EXISTS Costs_allcombo_view;`);
    await run(`
      CREATE VIEW Costs_allcombo_view AS
      WITH 
      -- Direct join: child costs mapped to parent customers
      child_costs AS (
        SELECT 
          fc.cost_id,
          fc.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.child_id as rollup_customer_id,
          fc.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fc.cogs,
          fc.logs,
          1 as has_data
        FROM fact_costs fc
        INNER JOIN customer_rollup cr ON fc.customer_id = cr.child_id
        INNER JOIN product_m p ON fc.product_id = p.product_id
        INNER JOIN time_m t ON fc.time_id = t.time_id
      ),
      -- Rollup costs: aggregated averages for parent customers
      rollup_costs AS (
        SELECT 
          NULL as cost_id,
          fc.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.parent_id as rollup_customer_id,
          fc.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          AVG(fc.cogs) as cogs,
          AVG(fc.logs) as logs,
          1 as has_data
        FROM fact_costs fc
        INNER JOIN customer_rollup cr ON fc.customer_id = cr.child_id
        INNER JOIN product_m p ON fc.product_id = p.product_id
        INNER JOIN time_m t ON fc.time_id = t.time_id
        WHERE cr.parent_id != cr.child_id
        GROUP BY 
          fc.product_id, p.sku_name, p.barcode, p.category_id, p.brand_id,
          cr.parent_id, fc.time_id, t.date, t.year, t.quarter, t.month, t.week, t.day
      ),
      -- Parent direct costs: costs for parent customers
      parent_direct_costs AS (
        SELECT 
          fc.cost_id,
          fc.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          fc.customer_id,
          fc.customer_id as rollup_customer_id,
          fc.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fc.cogs,
          fc.logs,
          1 as has_data
        FROM fact_costs fc
        INNER JOIN product_m p ON fc.product_id = p.product_id
        INNER JOIN time_m t ON fc.time_id = t.time_id
        WHERE EXISTS (
          SELECT 1 FROM customer_rollup cr 
          WHERE cr.parent_id = fc.customer_id AND cr.parent_id != cr.child_id
        )
      ),
      -- Drill-down costs: copy costs from parents to their children
      drilldown_costs AS (
        SELECT 
          NULL as cost_id,
          pdc.product_id,
          pdc.sku_name,
          pdc.barcode,
          pdc.category_id,
          pdc.brand_id,
          cr.child_id as customer_id,
          cr.child_id as rollup_customer_id,
          pdc.time_id,
          pdc.date,
          pdc.year,
          pdc.quarter,
          pdc.month,
          pdc.week,
          pdc.day,
          pdc.cogs,
          pdc.logs,
          1 as has_data
        FROM parent_direct_costs pdc
        INNER JOIN customer_rollup cr ON pdc.customer_id = cr.parent_id
        WHERE cr.parent_id != cr.child_id
        AND NOT EXISTS (
          SELECT 1 FROM fact_costs fc2 
          WHERE fc2.customer_id = cr.child_id 
          AND fc2.product_id = pdc.product_id 
          AND fc2.time_id = pdc.time_id
        )
      )
      SELECT * FROM child_costs
      UNION ALL
      SELECT * FROM rollup_costs
      UNION ALL
      SELECT * FROM drilldown_costs
    `);
    logger.info('Created Costs_allcombo_view');

    // Create Basevolume_allcombo_view
    await run(`DROP VIEW IF EXISTS Basevolume_allcombo_view;`);
    await run(`
      CREATE VIEW Basevolume_allcombo_view AS
      WITH 
      -- Direct join: child volumes mapped to parent customers
      child_volumes AS (
        SELECT 
          fbv.base_volume_id,
          fbv.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.child_id as rollup_customer_id,
          fbv.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fbv.volume,
          1 as has_data
        FROM fact_base_volume fbv
        INNER JOIN customer_rollup cr ON fbv.customer_id = cr.child_id
        INNER JOIN product_m p ON fbv.product_id = p.product_id
        INNER JOIN time_m t ON fbv.time_id = t.time_id
      ),
      -- Rollup volumes: SUM aggregation for parent customers (volumes are additive)
      rollup_volumes AS (
        SELECT 
          NULL as base_volume_id,
          fbv.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          cr.parent_id as customer_id,
          cr.parent_id as rollup_customer_id,
          fbv.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          SUM(fbv.volume) as volume,
          1 as has_data
        FROM fact_base_volume fbv
        INNER JOIN customer_rollup cr ON fbv.customer_id = cr.child_id
        INNER JOIN product_m p ON fbv.product_id = p.product_id
        INNER JOIN time_m t ON fbv.time_id = t.time_id
        WHERE cr.parent_id != cr.child_id
        GROUP BY 
          fbv.product_id, p.sku_name, p.barcode, p.category_id, p.brand_id,
          cr.parent_id, fbv.time_id, t.date, t.year, t.quarter, t.month, t.week, t.day
      ),
      -- Parent direct volumes: volumes for parent customers
      parent_direct_volumes AS (
        SELECT 
          fbv.base_volume_id,
          fbv.product_id,
          p.sku_name,
          p.barcode,
          p.category_id,
          p.brand_id,
          fbv.customer_id,
          fbv.customer_id as rollup_customer_id,
          fbv.time_id,
          t.date,
          t.year,
          t.quarter,
          t.month,
          t.week,
          t.day,
          fbv.volume,
          1 as has_data
        FROM fact_base_volume fbv
        INNER JOIN product_m p ON fbv.product_id = p.product_id
        INNER JOIN time_m t ON fbv.time_id = t.time_id
        WHERE EXISTS (
          SELECT 1 FROM customer_rollup cr 
          WHERE cr.parent_id = fbv.customer_id AND cr.parent_id != cr.child_id
        )
      ),
      -- Drill-down volumes: distribute volumes equally among direct children at each hierarchical level
      -- A direct child is one where there's no intermediate node between parent and child
      direct_children AS (
        SELECT 
          cr1.parent_id,
          cr1.child_id,
          COUNT(*) OVER (PARTITION BY cr1.parent_id) as child_count
        FROM customer_rollup cr1
        WHERE cr1.parent_id != cr1.child_id
        AND NOT EXISTS (
          -- Exclude if there's an intermediate node (making it transitive, not direct)
          SELECT 1 FROM customer_rollup cr2
          WHERE cr2.parent_id = cr1.parent_id
          AND cr2.child_id != cr1.child_id
          AND cr2.child_id != cr2.parent_id
          AND EXISTS (
            SELECT 1 FROM customer_rollup cr3
            WHERE cr3.parent_id = cr2.child_id
            AND cr3.child_id = cr1.child_id
          )
        )
      ),
      -- Level 1 drill-down: distribute parent volumes equally to direct children
      drilldown_level1 AS (
        SELECT 
          NULL as base_volume_id,
          pdv.product_id,
          pdv.sku_name,
          pdv.barcode,
          pdv.category_id,
          pdv.brand_id,
          dc.child_id as customer_id,
          dc.child_id as rollup_customer_id,
          pdv.time_id,
          pdv.date,
          pdv.year,
          pdv.quarter,
          pdv.month,
          pdv.week,
          pdv.day,
          pdv.volume / NULLIF(dc.child_count, 0) as volume,
          1 as has_data
        FROM parent_direct_volumes pdv
        INNER JOIN direct_children dc ON pdv.customer_id = dc.parent_id
        WHERE NOT EXISTS (
          SELECT 1 FROM fact_base_volume fbv2 
          WHERE fbv2.customer_id = dc.child_id 
          AND fbv2.product_id = pdv.product_id 
          AND fbv2.time_id = pdv.time_id
        )
      ),
      -- Level 2 drill-down: distribute level 1 volumes equally to their direct children
      drilldown_level2 AS (
        SELECT 
          NULL as base_volume_id,
          dl1.product_id,
          dl1.sku_name,
          dl1.barcode,
          dl1.category_id,
          dl1.brand_id,
          dc2.child_id as customer_id,
          dc2.child_id as rollup_customer_id,
          dl1.time_id,
          dl1.date,
          dl1.year,
          dl1.quarter,
          dl1.month,
          dl1.week,
          dl1.day,
          dl1.volume / NULLIF(dc2.child_count, 0) as volume,
          1 as has_data
        FROM drilldown_level1 dl1
        INNER JOIN direct_children dc2 ON dl1.customer_id = dc2.parent_id
        WHERE NOT EXISTS (
          SELECT 1 FROM fact_base_volume fbv2 
          WHERE fbv2.customer_id = dc2.child_id 
          AND fbv2.product_id = dl1.product_id 
          AND fbv2.time_id = dl1.time_id
        )
      ),
      -- Level 3 drill-down: distribute level 2 volumes equally to their direct children
      drilldown_level3 AS (
        SELECT 
          NULL as base_volume_id,
          dl2.product_id,
          dl2.sku_name,
          dl2.barcode,
          dl2.category_id,
          dl2.brand_id,
          dc3.child_id as customer_id,
          dc3.child_id as rollup_customer_id,
          dl2.time_id,
          dl2.date,
          dl2.year,
          dl2.quarter,
          dl2.month,
          dl2.week,
          dl2.day,
          dl2.volume / NULLIF(dc3.child_count, 0) as volume,
          1 as has_data
        FROM drilldown_level2 dl2
        INNER JOIN direct_children dc3 ON dl2.customer_id = dc3.parent_id
        WHERE NOT EXISTS (
          SELECT 1 FROM fact_base_volume fbv2 
          WHERE fbv2.customer_id = dc3.child_id 
          AND fbv2.product_id = dl2.product_id 
          AND fbv2.time_id = dl2.time_id
        )
      ),
      -- Combine all drill-down levels
      drilldown_volumes AS (
        SELECT * FROM drilldown_level1
        UNION ALL
        SELECT * FROM drilldown_level2
        UNION ALL
        SELECT * FROM drilldown_level3
      )
      SELECT * FROM child_volumes
      UNION ALL
      SELECT * FROM rollup_volumes
      UNION ALL
      SELECT * FROM drilldown_volumes
    `);
    logger.info('Created Basevolume_allcombo_view');

    logger.info('Fact table views created successfully');
  } catch (error: any) {
    logger.error('Error creating fact table views', error);
    throw error;
  }
}

/**
 * Clear all DuckDB views and tables (except system tables)
 */
export async function clearAllDuckDBViewsAndTables(): Promise<void> {
  if (!duckdbAvailable || !db) {
    throw new Error('DuckDB is not available');
  }

  const runLocal = (sql: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      db.run(sql, (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  try {
    logger.info('Clearing all DuckDB views and tables...');

    // Get all views
    const views = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' AND table_type = 'VIEW'
      `, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });

    // Drop all views
    for (const view of views) {
      const viewName = view.table_name;
      try {
        await runLocal(`DROP VIEW IF EXISTS ${viewName};`);
        logger.info(`Dropped view: ${viewName}`);
      } catch (error: any) {
        logger.warn(`Failed to drop view ${viewName}:`, error.message);
      }
    }

    // Get all tables (excluding system tables)
    const tables = await new Promise<any[]>((resolve, reject) => {
      db.all(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'main' AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE 'sqlite_%'
      `, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });

    // Drop all tables
    for (const table of tables) {
      const tableName = table.table_name;
      try {
        await runLocal(`DROP TABLE IF EXISTS ${tableName};`);
        logger.info(`Dropped table: ${tableName}`);
      } catch (error: any) {
        logger.warn(`Failed to drop table ${tableName}:`, error.message);
      }
    }

    logger.info('Successfully cleared all DuckDB views and tables');
  } catch (error: any) {
    logger.error('Error clearing DuckDB views and tables', error);
    throw error;
  }
}
