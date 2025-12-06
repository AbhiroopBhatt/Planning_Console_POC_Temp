import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { query } from '../db/postgres';
import { getSession } from '../db/neo4j';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
dotenv.config();

// Connection pool for pc_postgres_db
const getPcDbPool = () => {
  return new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'pc_postgres_db',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 10,
  });
};

let pcDbPool = getPcDbPool();

// Fallback: Get tables via Docker exec
async function getTablesViaDocker(): Promise<any[]> {
  try {
    const query = `
      SELECT 
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = t.table_name)::text as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const { stdout } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
    );
    
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    return lines.map(line => {
      const [table_name, column_count] = line.split('|');
      return { table_name, column_count: parseInt(column_count) || 0 };
    });
  } catch (error: any) {
    logger.error('Docker exec fallback failed', error);
    throw error;
  }
}

// Get primary keys for tables via Docker exec
async function getPrimaryKeysViaDocker(tableNames: string[]): Promise<any> {
  try {
    const tableList = tableNames.map(t => `'${t}'`).join(',');
    const query = `
      SELECT 
        tc.table_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY' 
        AND tc.table_schema = 'public'
        AND tc.table_name IN (${tableList})
      ORDER BY tc.table_name, kcu.ordinal_position
    `;
    
    const { stdout } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
    );
    
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    const result: any = {};
    
    lines.forEach(line => {
      const [table_name, column_name, ordinal_position] = line.split('|');
      if (!result[table_name]) {
        result[table_name] = [];
      }
      result[table_name].push({
        column_name,
        ordinal_position: parseInt(ordinal_position) || 0
      });
    });
    
    return result;
  } catch (error: any) {
    logger.error('Docker exec fallback failed for primary keys', error);
    throw error;
  }
}

// Get all columns for tables via Docker exec
async function getTableColumnsViaDocker(tableNames: string[]): Promise<any> {
  try {
    const tableList = tableNames.map(t => `'${t}'`).join(',');
    const query = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tableList})
      ORDER BY table_name, ordinal_position
    `;
    
    const { stdout } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
    );
    
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    const result: any = {};
    
    lines.forEach(line => {
      const [table_name, column_name, data_type, is_nullable, column_default, ordinal_position] = line.split('|');
      if (!result[table_name]) {
        result[table_name] = [];
      }
      result[table_name].push({
        column_name,
        data_type,
        is_nullable: is_nullable === 'YES',
        column_default,
        ordinal_position: parseInt(ordinal_position) || 0
      });
    });
    
    return result;
  } catch (error: any) {
    logger.error('Docker exec fallback failed for columns', error);
    throw error;
  }
}

export const hierarchyController = {
  // New methods for node selection
  getTables: async (req: Request, res: Response) => {
    try {
      // Try direct connection first
      try {
        await pcDbPool.query('SELECT 1');
        
        const result = await pcDbPool.query(`
          SELECT 
            table_name,
            (SELECT COUNT(*) FROM information_schema.columns 
             WHERE table_schema = 'public' AND table_name = t.table_name) as column_count
          FROM information_schema.tables t
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `);
        
        res.json({ success: true, data: result.rows });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          const tables = await getTablesViaDocker();
          res.json({ success: true, data: tables });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching tables', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch tables',
        details: error.message 
      });
    }
  },

  getTableDetails: async (req: Request, res: Response) => {
    try {
      const { tableNames } = req.body;
      
      if (!Array.isArray(tableNames) || tableNames.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'tableNames must be a non-empty array' 
        });
      }

      // Sanitize table names
      const sanitized = tableNames.filter(name => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));
      
      if (sanitized.length !== tableNames.length) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid table names provided' 
        });
      }

      try {
        await pcDbPool.query('SELECT 1');
        
        // Get primary keys
        const pkResult = await pcDbPool.query(`
          SELECT 
            tc.table_name,
            kcu.column_name,
            kcu.ordinal_position
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_schema = 'public'
            AND tc.table_name = ANY($1)
          ORDER BY tc.table_name, kcu.ordinal_position
        `, [sanitized]);
        
        // Get all columns
        const columnsResult = await pcDbPool.query(`
          SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable,
            column_default,
            ordinal_position
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY($1)
          ORDER BY table_name, ordinal_position
        `, [sanitized]);
        
        // Organize data by table
        const tables: any = {};
        
        sanitized.forEach(tableName => {
          tables[tableName] = {
            columns: columnsResult.rows
              .filter((r: any) => r.table_name === tableName)
              .map((r: any) => ({
                column_name: r.column_name,
                data_type: r.data_type,
                is_nullable: r.is_nullable === 'YES',
                column_default: r.column_default,
                ordinal_position: r.ordinal_position
              })),
            primary_keys: pkResult.rows
              .filter((r: any) => r.table_name === tableName)
              .map((r: any) => ({
                column_name: r.column_name,
                ordinal_position: r.ordinal_position
              }))
          };
        });
        
        res.json({ success: true, data: tables });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          
          const [primaryKeys, columns] = await Promise.all([
            getPrimaryKeysViaDocker(sanitized),
            getTableColumnsViaDocker(sanitized)
          ]);
          
          const tables: any = {};
          sanitized.forEach(tableName => {
            tables[tableName] = {
              columns: columns[tableName] || [],
              primary_keys: primaryKeys[tableName] || []
            };
          });
          
          res.json({ success: true, data: tables });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching table details', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch table details',
        details: error.message 
      });
    }
  },

  // Relationship management
  getRelationships: async (req: Request, res: Response) => {
    try {
      // Try direct connection first
      try {
        await pcDbPool.query('SELECT 1');
        
        const result = await pcDbPool.query(`
          SELECT * FROM hierarchy_relationships 
          ORDER BY created_at DESC
        `);
        res.json({ success: true, data: result.rows });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          
          // Use Docker exec to get relationships
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "SELECT relationship_id, from_node, from_node_column, relationship_name, to_node, to_node_column, source_table, source_from_column, source_to_column, created_at, updated_at FROM hierarchy_relationships ORDER BY created_at DESC;"`
          );
          
          const lines = stdout.trim().split('\n').filter(l => l.trim());
          const relationships = lines.map(line => {
            const [relationship_id, from_node, from_node_column, relationship_name, to_node, to_node_column, source_table, source_from_column, source_to_column, created_at, updated_at] = line.split('|');
            return {
              relationship_id: parseInt(relationship_id) || 0,
              from_node,
              from_node_column,
              relationship_name,
              to_node,
              to_node_column,
              source_table,
              source_from_column,
              source_to_column,
              created_at,
              updated_at
            };
          });
          
          res.json({ success: true, data: relationships });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        res.json({ success: true, data: [] });
        return;
      }
      logger.error('Error fetching relationships', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch relationships',
        details: error.message 
      });
    }
  },

  createRelationship: async (req: Request, res: Response) => {
    try {
      const {
        from_node,
        from_node_column,
        relationship_name,
        to_node,
        to_node_column,
        source_table,
        source_from_column,
        source_to_column
      } = req.body;

      // Validate required fields
      if (!from_node || !from_node_column || !relationship_name || !to_node || !to_node_column || !source_table) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: from_node, from_node_column, relationship_name, to_node, to_node_column, source_table'
        });
      }

      // Sanitize inputs
      const sanitize = (str: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str);
      if (!sanitize(from_node) || !sanitize(to_node) || !sanitize(source_table)) {
        return res.status(400).json({ success: false, error: 'Invalid table or node names' });
      }

      try {
        await pcDbPool.query('SELECT 1');
        
        const result = await pcDbPool.query(`
          INSERT INTO hierarchy_relationships (
            from_node, from_node_column, relationship_name, to_node, to_node_column,
            source_table, source_from_column, source_to_column
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          from_node, from_node_column, relationship_name, to_node, to_node_column,
          source_table, source_from_column || null, source_to_column || null
        ]);

        logger.info(`Relationship created with ID: ${result.rows[0].relationship_id}`);
        res.json({ success: true, data: result.rows[0], message: 'Relationship added successfully' });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          
          // Use Docker exec to insert
          const insertQuery = `
            INSERT INTO hierarchy_relationships (
              from_node, from_node_column, relationship_name, to_node, to_node_column,
              source_table, source_from_column, source_to_column
            ) VALUES (
              '${from_node}', '${from_node_column}', '${relationship_name}', 
              '${to_node}', '${to_node_column}', '${source_table}', 
              ${source_from_column ? `'${source_from_column}'` : 'NULL'}, 
              ${source_to_column ? `'${source_to_column}'` : 'NULL'}
            ) RETURNING relationship_id, from_node, from_node_column, relationship_name, 
              to_node, to_node_column, source_table, source_from_column, source_to_column, 
              created_at, updated_at;
          `;
          
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${insertQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );
          
          const line = stdout.trim().split('\n')[0];
          const [relationship_id, from_node_res, from_node_column_res, relationship_name_res, to_node_res, to_node_column_res, source_table_res, source_from_column_res, source_to_column_res, created_at, updated_at] = line.split('|');
          
          const relationship = {
            relationship_id: parseInt(relationship_id) || 0,
            from_node: from_node_res,
            from_node_column: from_node_column_res,
            relationship_name: relationship_name_res,
            to_node: to_node_res,
            to_node_column: to_node_column_res,
            source_table: source_table_res,
            source_from_column: source_from_column_res || null,
            source_to_column: source_to_column_res || null,
            created_at,
            updated_at
          };
          
          logger.info(`Relationship created with ID: ${relationship.relationship_id}`);
          res.json({ success: true, data: relationship, message: 'Relationship added successfully' });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error creating relationship', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create relationship',
        details: error.message
      });
    }
  },

  updateRelationship: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        from_node,
        from_node_column,
        relationship_name,
        to_node,
        to_node_column,
        source_table,
        source_from_column,
        source_to_column
      } = req.body;

      const result = await pcDbPool.query(`
        UPDATE hierarchy_relationships
        SET from_node = $1, from_node_column = $2, relationship_name = $3,
            to_node = $4, to_node_column = $5, source_table = $6,
            source_from_column = $7, source_to_column = $8,
            updated_at = CURRENT_TIMESTAMP
        WHERE relationship_id = $9
        RETURNING *
      `, [
        from_node, from_node_column, relationship_name, to_node, to_node_column,
        source_table, source_from_column || null, source_to_column || null, id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Relationship not found' });
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      logger.error('Error updating relationship', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update relationship',
        details: error.message
      });
    }
  },

  deleteRelationship: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ success: false, error: 'Invalid relationship ID' });
      }

      try {
        await pcDbPool.query('SELECT 1');
        
        const result = await pcDbPool.query(
          'DELETE FROM hierarchy_relationships WHERE relationship_id = $1 RETURNING *',
          [id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Relationship not found' });
        }

        logger.info(`Relationship deleted with ID: ${id}`);
        res.json({ success: true, message: 'Relationship deleted successfully' });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          
          // Use Docker exec to delete
          const deleteQuery = `DELETE FROM hierarchy_relationships WHERE relationship_id = ${id} RETURNING relationship_id;`;
          
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${deleteQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );
          
          const deletedId = stdout.trim();
          
          if (!deletedId || deletedId === '') {
            return res.status(404).json({ success: false, error: 'Relationship not found' });
          }
          
          logger.info(`Relationship deleted with ID: ${id} via Docker exec`);
          res.json({ success: true, message: 'Relationship deleted successfully' });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error deleting relationship', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete relationship',
        details: error.message
      });
    }
  },

  // Build Graph - Import nodes and relationships to Neo4j
  buildGraph: async (req: Request, res: Response) => {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `graph-build-${timestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    const writeLog = (message: string) => {
      if (!logStream.closed && logStream.writable) {
        const logMessage = `[${new Date().toISOString()}] ${message}\n`;
        logStream.write(logMessage);
      }
      logger.info(message);
    };

    try {
      const { selectedTables } = req.body;
      
      writeLog('═══════════════════════════════════════════════════════');
      writeLog('GRAPH BUILD PROCESS STARTED');
      writeLog('═══════════════════════════════════════════════════════');
      writeLog(`Selected Tables: ${selectedTables.join(', ')}`);
      writeLog(`Log File: ${logFilePath}`);
      writeLog('');

      if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
        writeLog('ERROR: selectedTables must be a non-empty array');
        logStream.end();
        return res.status(400).json({
          success: false,
          error: 'selectedTables must be a non-empty array'
        });
      }

      // Get all relationships
      let relationships: any[] = [];
      writeLog('Fetching relationships from hierarchy_relationships table...');
      try {
        await pcDbPool.query('SELECT 1');
        const relResult = await pcDbPool.query(`
          SELECT * FROM hierarchy_relationships ORDER BY relationship_id
        `);
        relationships = relResult.rows;
        writeLog(`Found ${relationships.length} relationship(s) defined`);
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          // Use Docker exec fallback
          writeLog('Using Docker exec fallback for relationships...');
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "SELECT relationship_id, from_node, from_node_column, relationship_name, to_node, to_node_column, source_table, source_from_column, source_to_column FROM hierarchy_relationships ORDER BY relationship_id;"`
          );
          const lines = stdout.trim().split('\n').filter(l => l.trim());
          relationships = lines.map(line => {
            const [relationship_id, from_node, from_node_column, relationship_name, to_node, to_node_column, source_table, source_from_column, source_to_column] = line.split('|');
            return {
              relationship_id: parseInt(relationship_id) || 0,
              from_node,
              from_node_column,
              relationship_name,
              to_node,
              to_node_column,
              source_table,
              source_from_column,
              source_to_column
            };
          });
          writeLog(`Found ${relationships.length} relationship(s) via Docker exec`);
        } else {
          throw directError;
        }
      }

      // Log all relationships
      if (relationships.length > 0) {
        writeLog('');
        writeLog('DEFINED RELATIONSHIPS:');
        relationships.forEach((rel, idx) => {
          writeLog(`  ${idx + 1}. ${rel.relationship_name}`);
          writeLog(`     From: ${rel.from_node}.${rel.from_node_column}`);
          writeLog(`     To: ${rel.to_node}.${rel.to_node_column}`);
          writeLog(`     Source Table: ${rel.source_table}`);
          writeLog(`     Source Columns: ${rel.source_from_column} -> ${rel.source_to_column}`);
        });
        writeLog('');
      }

      const session = getSession();
      const stats = {
        nodesCreated: 0,
        relationshipsCreated: 0,
        errors: [] as string[]
      };

      try {
        // Step 1: Clear existing graph data (optional - you might want to keep it)
        writeLog('STEP 1: Clearing existing graph data...');
        const clearResult = await session.run('MATCH (n) DETACH DELETE n RETURN count(n) as deleted');
        const deletedCount = clearResult.records[0]?.get('deleted') || 0;
        writeLog(`Cleared ${deletedCount} existing node(s)`);
        writeLog('');

        // Step 2: Create nodes for each selected table
        writeLog('═══════════════════════════════════════════════════════');
        writeLog('STEP 2: CREATING NODES');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog(`Processing ${selectedTables.length} table(s)...`);
        writeLog('');
        
        for (const tableName of selectedTables) {
          try {
            writeLog(`─────────────────────────────────────────────────────`);
            writeLog(`TABLE: ${tableName}`);
            writeLog(`─────────────────────────────────────────────────────`);
            
            // Get all data from the table
            let tableData: any[] = [];
            try {
              await pcDbPool.query('SELECT 1');
              const dataResult = await pcDbPool.query(`SELECT * FROM "${tableName}"`);
              tableData = dataResult.rows;
            } catch (directError: any) {
              if (directError.code === '28000' || directError.message?.includes('does not exist')) {
                // Get columns first
                const { stdout: colsStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${tableName}' ORDER BY ordinal_position;"`
                );
                const columns = colsStdout.trim().split('\n').filter(c => c.trim());
                
                // Get data
                const { stdout: dataStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "SELECT * FROM ${tableName};"`
                );
                const dataLines = dataStdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
                
                tableData = dataLines.map(line => {
                  const values = line.split('|');
                  const row: any = {};
                  columns.forEach((col, idx) => {
                    const val = values[idx]?.trim();
                    row[col] = val === '' ? null : val;
                  });
                  return row;
                });
              } else {
                throw directError;
              }
            }

            // Get primary key for this table
            let primaryKey: string | null = null;
            try {
              await pcDbPool.query('SELECT 1');
              const pkResult = await pcDbPool.query(`
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY' 
                  AND tc.table_schema = 'public'
                  AND tc.table_name = $1
                LIMIT 1
              `, [tableName]);
              primaryKey = pkResult.rows[0]?.column_name || null;
            } catch (directError: any) {
              if (directError.code === '28000' || directError.message?.includes('does not exist')) {
                const { stdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -c "SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = '${tableName}' LIMIT 1;"`
                );
                primaryKey = stdout.trim() || null;
              }
            }

            writeLog(`Primary Key: ${primaryKey || 'None (using full row as identifier)'}`);
            writeLog(`Total Rows: ${tableData.length}`);
            writeLog('');
            writeLog('Creating nodes...');
            
            // Create nodes in Neo4j
            const nodeLabel = tableName; // Use table name as node label
            let nodeCount = 0;
            for (const row of tableData) {
              try {
                // Convert all values to appropriate types
                const properties: any = {};
                Object.keys(row).forEach(key => {
                  const value = row[key];
                  if (value === null || value === undefined || value === '') {
                    properties[key] = null;
                  } else if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
                    // Try to convert to number if it's a numeric string
                    const num = Number(value);
                    if (!isNaN(num) && isFinite(num)) {
                      properties[key] = num;
                    } else {
                      properties[key] = value;
                    }
                  } else {
                    properties[key] = value;
                  }
                });

                // Use primary key as the unique identifier
                const identifier = primaryKey ? properties[primaryKey] : JSON.stringify(properties);
                
                // Create node with all columns as properties
                // Use the primary key column name for the id property
                const idProperty = primaryKey || 'id';
                const idValue = primaryKey ? properties[primaryKey] : identifier;
                
                await session.run(
                  `MERGE (n:${nodeLabel} {${idProperty}: $idValue})
                   SET n = $props`,
                  {
                    idValue: idValue,
                    props: properties
                  }
                );
                stats.nodesCreated++;
                nodeCount++;
                
                // Log node creation (limit detailed logging to first 5 nodes per table to avoid huge logs)
                if (nodeCount <= 5) {
                  writeLog(`  ✓ Node ${nodeCount}: ${nodeLabel}(${idProperty}=${idValue})`);
                  if (nodeCount === 5 && tableData.length > 5) {
                    writeLog(`  ... (${tableData.length - 5} more nodes created, see summary below)`);
                  }
                }
              } catch (nodeError: any) {
                const errorMsg = `Error creating node in ${tableName}: ${nodeError.message}`;
                stats.errors.push(errorMsg);
                writeLog(`  ✗ ERROR: ${errorMsg}`);
                logger.error(`Error creating node in ${tableName}`, nodeError);
              }
            }
            writeLog(`✓ Created ${nodeCount} node(s) for ${tableName}`);
            writeLog('');
          } catch (tableError: any) {
            stats.errors.push(`Error processing table ${tableName}: ${tableError.message}`);
            logger.error(`Error processing table ${tableName}`, tableError);
          }
        }

        // Step 3: Create relationships
        writeLog('═══════════════════════════════════════════════════════');
        writeLog('STEP 3: CREATING RELATIONSHIPS');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog(`Processing ${relationships.length} relationship(s)...`);
        writeLog('');
        
        for (const rel of relationships) {
          try {
            writeLog(`─────────────────────────────────────────────────────`);
            writeLog(`RELATIONSHIP: ${rel.relationship_name}`);
            writeLog(`  From: ${rel.from_node}.${rel.from_node_column}`);
            writeLog(`  To: ${rel.to_node}.${rel.to_node_column}`);
            writeLog(`  Source Table: ${rel.source_table}`);
            writeLog(`─────────────────────────────────────────────────────`);
            
            // Get primary keys for FROM and TO nodes to ensure correct node matching
            // For self-referencing relationships, both should use the same primary key column
            let fromNodePk: string | null = null;
            let toNodePk: string | null = null;
            
            try {
              await pcDbPool.query('SELECT 1');
              // Get FROM node primary key
              const fromPkResult = await pcDbPool.query(`
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY' 
                  AND tc.table_schema = 'public'
                  AND tc.table_name = $1
                LIMIT 1
              `, [rel.from_node]);
              fromNodePk = fromPkResult.rows[0]?.column_name || null;
              
              // Get TO node primary key
              const toPkResult = await pcDbPool.query(`
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu 
                  ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY' 
                  AND tc.table_schema = 'public'
                  AND tc.table_name = $1
                LIMIT 1
              `, [rel.to_node]);
              toNodePk = toPkResult.rows[0]?.column_name || null;
            } catch (directError: any) {
              if (directError.code === '28000' || directError.message?.includes('does not exist')) {
                // Use Docker exec fallback
                const { stdout: fromPkStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -c "SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = '${rel.from_node}' LIMIT 1;"`
                );
                fromNodePk = fromPkStdout.trim() || null;
                
                const { stdout: toPkStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -c "SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = '${rel.to_node}' LIMIT 1;"`
                );
                toNodePk = toPkStdout.trim() || null;
              }
            }
            
            // For self-referencing relationships, use the primary key for both FROM and TO nodes
            // The to_node_column in the relationship definition refers to the source table column,
            // but we need to match the TO node by its primary key property
            const fromMatchColumn = fromNodePk || rel.from_node_column;
            const toMatchColumn = (rel.from_node === rel.to_node) ? (toNodePk || rel.from_node_column) : (toNodePk || rel.to_node_column);
            
            // Get full data from source table (all columns for relationship properties)
            let sourceData: any[] = [];
            try {
              await pcDbPool.query('SELECT 1');
              const sourceResult = await pcDbPool.query(`SELECT * FROM "${rel.source_table}"`);
              sourceData = sourceResult.rows;
            } catch (directError: any) {
              if (directError.code === '28000' || directError.message?.includes('does not exist')) {
                // Get columns first
                const { stdout: colsStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${rel.source_table}' ORDER BY ordinal_position;"`
                );
                const columns = colsStdout.trim().split('\n').filter(c => c.trim());
                
                // Get full data
                const { stdout: dataStdout } = await execAsync(
                  `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "SELECT * FROM ${rel.source_table};"`
                );
                const dataLines = dataStdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
                
                sourceData = dataLines.map(line => {
                  const values = line.split('|');
                  const row: any = {};
                  columns.forEach((col, idx) => {
                    const val = values[idx]?.trim();
                    if (val === '' || val === null || val === undefined) {
                      row[col] = null;
                    } else {
                      // Try to convert to number if it's numeric
                      const num = Number(val);
                      if (!isNaN(num) && isFinite(num) && val !== '') {
                        row[col] = num;
                      } else {
                        row[col] = val;
                      }
                    }
                  });
                  return row;
                });
              } else {
                throw directError;
              }
            }

            writeLog(`Source Data Rows: ${sourceData.length}`);
            writeLog('');
            writeLog('Creating relationships...');
            
            // Create relationships with all source columns as properties
            let relCount = 0;
            let skippedCount = 0;
            for (const row of sourceData) {
              try {
                let fromValue = row[rel.source_from_column];
                let toValue = row[rel.source_to_column];
                
                // Convert to appropriate types (numbers if numeric)
                if (fromValue !== null && fromValue !== undefined && fromValue !== '') {
                  if (typeof fromValue === 'string' && !isNaN(Number(fromValue)) && fromValue.trim() !== '') {
                    fromValue = Number(fromValue);
                  }
                }
                if (toValue !== null && toValue !== undefined && toValue !== '') {
                  if (typeof toValue === 'string' && !isNaN(Number(toValue)) && toValue.trim() !== '') {
                    toValue = Number(toValue);
                  }
                }
                
                // Skip if either value is null/undefined/empty
                if (fromValue === null || fromValue === undefined || fromValue === '' || 
                    toValue === null || toValue === undefined || toValue === '') {
                  skippedCount++;
                  continue;
                }
                
                // For self-referencing relationships, skip if fromValue === toValue (self-loop)
                // This prevents nodes from referencing themselves
                if (rel.from_node === rel.to_node && fromValue === toValue) {
                  skippedCount++;
                  writeLog(`  ⚠ SKIPPED: Self-reference detected (${rel.from_node_column}=${fromValue} -> ${rel.to_node_column}=${toValue})`);
                  continue;
                }
                  // Convert all row values to appropriate types for relationship properties
                  const relProperties: any = {};
                  Object.keys(row).forEach(key => {
                    const value = row[key];
                    if (value !== null && value !== undefined && value !== '') {
                      if (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '') {
                        const num = Number(value);
                        if (!isNaN(num) && isFinite(num)) {
                          relProperties[key] = num;
                        } else {
                          relProperties[key] = value;
                        }
                      } else {
                        relProperties[key] = value;
                      }
                    }
                  });
                  
                  // First verify nodes exist using the correct primary key columns
                  const fromNodeCheck = await session.run(
                    `MATCH (from:${rel.from_node} {${fromMatchColumn}: $fromValue}) RETURN count(from) as count`,
                    { fromValue: fromValue }
                  );
                  const toNodeCheck = await session.run(
                    `MATCH (to:${rel.to_node} {${toMatchColumn}: $toValue}) RETURN count(to) as count`,
                    { toValue: toValue }
                  );
                  
                  const fromExists = fromNodeCheck.records[0]?.get('count').toNumber() > 0;
                  const toExists = toNodeCheck.records[0]?.get('count').toNumber() > 0;
                  
                  if (!fromExists) {
                    const errorMsg = `From node not found: ${rel.from_node}(${fromMatchColumn}=${fromValue})`;
                    stats.errors.push(errorMsg);
                    writeLog(`  ✗ SKIPPED: ${errorMsg}`);
                    skippedCount++;
                    continue;
                  }
                  
                  if (!toExists) {
                    const errorMsg = `To node not found: ${rel.to_node}(${toMatchColumn}=${toValue})`;
                    stats.errors.push(errorMsg);
                    writeLog(`  ✗ SKIPPED: ${errorMsg}`);
                    skippedCount++;
                    continue;
                  }
                  
                  // Use parameterized query to avoid injection and ensure type matching
                  // Use the correct primary key columns for matching
                  const result = await session.run(
                    `MATCH (from:${rel.from_node} {${fromMatchColumn}: $fromValue})
                     MATCH (to:${rel.to_node} {${toMatchColumn}: $toValue})
                     MERGE (from)-[r:${rel.relationship_name}]->(to)
                     SET r = $props
                     RETURN r, from.${fromMatchColumn} as fromId, to.${toMatchColumn} as toId`,
                    {
                      fromValue: fromValue,
                      toValue: toValue,
                      props: relProperties
                    }
                  );
                  
                  // Check if relationship was actually created
                  if (result.records.length > 0) {
                    const record = result.records[0];
                    const fromId = record.get('fromId');
                    const toId = record.get('toId');
                    stats.relationshipsCreated++;
                    relCount++;
                    
                    // Log relationship creation (limit detailed logging to first 10 relationships per type)
                    if (relCount <= 10) {
                      writeLog(`  ✓ Relationship ${relCount}: ${rel.from_node}(${fromId}) -[${rel.relationship_name}]-> ${rel.to_node}(${toId})`);
                      if (relCount === 10 && sourceData.length > 10) {
                        writeLog(`  ... (processing ${sourceData.length - 10} more rows, see summary below)`);
                      }
                    }
                    logger.info(`✅ Created relationship ${rel.relationship_name}: ${rel.from_node}(${rel.from_node_column}=${fromId}) -> ${rel.to_node}(${rel.to_node_column}=${toId})`);
                  } else {
                    const errorMsg = `Failed to create relationship ${rel.relationship_name}: No result returned for from=${fromValue}, to=${toValue}`;
                    stats.errors.push(errorMsg);
                    writeLog(`  ✗ ERROR: ${errorMsg}`);
                    logger.error(`❌ No result returned for relationship ${rel.relationship_name}: from=${fromValue}, to=${toValue}`);
                  }
              } catch (relError: any) {
                const errorMsg = `Error creating relationship ${rel.relationship_name}: ${relError.message}`;
                stats.errors.push(errorMsg);
                writeLog(`  ✗ ERROR: ${errorMsg}`);
                logger.error(`Error creating relationship`, { error: relError, relationship: rel, row });
              }
            }
            writeLog(`✓ Created ${relCount} relationship(s) for ${rel.relationship_name}`);
            if (skippedCount > 0) {
              writeLog(`⚠ Skipped ${skippedCount} row(s) (missing nodes or null values)`);
            }
            writeLog('');
          } catch (relTableError: any) {
            stats.errors.push(`Error processing relationship ${rel.relationship_name}: ${relTableError.message}`);
            logger.error(`Error processing relationship`, relTableError);
          }
        }

        // Write summary to log
        writeLog('');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog('BUILD SUMMARY');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog(`Nodes Created: ${stats.nodesCreated}`);
        writeLog(`Relationships Created: ${stats.relationshipsCreated}`);
        writeLog(`Errors: ${stats.errors.length}`);
        if (stats.errors.length > 0) {
          writeLog('');
          writeLog('ERRORS:');
          stats.errors.forEach((error, idx) => {
            writeLog(`  ${idx + 1}. ${error}`);
          });
        }
        writeLog('');
        writeLog('═══════════════════════════════════════════════════════');
        // Step 4: Refresh DuckDB rollup views (before closing log stream)
        writeLog('');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog('STEP 4: REFRESHING DUCKDB ROLLUP VIEWS');
        writeLog('═══════════════════════════════════════════════════════');
        
        try {
          const { refreshAllRollupViews } = require('../db/duckdb');
          writeLog('Refreshing hierarchy rollup views in DuckDB...');
          await refreshAllRollupViews();
          writeLog('✓ Successfully refreshed all rollup views');
          writeLog('');
        } catch (rollupError: any) {
          const errorMsg = `Error refreshing rollup views: ${rollupError.message}`;
          stats.errors.push(errorMsg);
          writeLog(`✗ ERROR: ${errorMsg}`);
          logger.error('Error refreshing rollup views', rollupError);
          // Don't fail the entire build process if rollup views fail
        }

        writeLog('GRAPH BUILD PROCESS COMPLETED');
        writeLog('═══════════════════════════════════════════════════════');
        writeLog(`Log file saved to: ${logFilePath}`);
        writeLog('');

        logStream.end();

        res.json({
          success: true,
          message: 'Graph built successfully',
          stats: {
            nodesCreated: stats.nodesCreated,
            relationshipsCreated: stats.relationshipsCreated,
            errors: stats.errors.length > 0 ? stats.errors : undefined
          },
          logFile: logFilePath,
          logFileName: logFileName
        });
      } finally {
        await session.close();
        if (!logStream.closed) {
          logStream.end();
        }
      }
    } catch (error: any) {
      writeLog('');
      writeLog('═══════════════════════════════════════════════════════');
      writeLog('BUILD FAILED');
      writeLog('═══════════════════════════════════════════════════════');
      writeLog(`Error: ${error.message}`);
      writeLog(`Stack: ${error.stack || 'N/A'}`);
      writeLog('');
      logStream.end();
      
      logger.error('Error building graph', error);
      res.status(500).json({
        success: false,
        error: 'Failed to build graph',
        details: error.message,
        logFile: logFilePath,
        logFileName: logFileName
      });
    }
  },

  // Get log file content
  getLogFile: async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const logsDir = path.join(process.cwd(), 'logs');
      const logFilePath = path.join(logsDir, filename);

      // Security: Ensure the file is in the logs directory
      if (!logFilePath.startsWith(logsDir)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid log file path'
        });
      }

      if (!fs.existsSync(logFilePath)) {
        return res.status(404).json({
          success: false,
          error: 'Log file not found'
        });
      }

      const logContent = fs.readFileSync(logFilePath, 'utf-8');
      res.json({
        success: true,
        filename,
        content: logContent
      });
    } catch (error: any) {
      logger.error('Error reading log file', error);
      res.status(500).json({
        success: false,
        error: 'Failed to read log file',
        details: error.message
      });
    }
  },

  // List all log files
  listLogFiles: async (req: Request, res: Response) => {
    try {
      const logsDir = path.join(process.cwd(), 'logs');
      
      if (!fs.existsSync(logsDir)) {
        return res.json({
          success: true,
          logs: []
        });
      }

      const files = fs.readdirSync(logsDir)
        .filter(file => file.endsWith('.log'))
        .map(file => {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.modified.getTime() - a.modified.getTime()); // Most recent first

      res.json({
        success: true,
        logs: files
      });
    } catch (error: any) {
      logger.error('Error listing log files', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list log files',
        details: error.message
      });
    }
  },

  // Legacy methods (to be kept for backward compatibility)
  getConfigs: async (req: Request, res: Response) => {
    try {
      const result = await query('SELECT * FROM hierarchy_configs ORDER BY created_at DESC');
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching hierarchy configs', error);
      res.status(500).json({ success: false, error: 'Failed to fetch hierarchy configs' });
    }
  },

  createConfig: async (req: Request, res: Response) => {
    try {
      const { config_name, node_type, relation_type, source_table, source_id_column, source_parent_column } = req.body;
      
      const result = await query(
        `INSERT INTO hierarchy_configs (config_name, node_type, relation_type, source_table, source_id_column, source_parent_column)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [config_name, node_type, relation_type, source_table, source_id_column, source_parent_column]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error creating hierarchy config', error);
      res.status(500).json({ success: false, error: 'Failed to create hierarchy config' });
    }
  },

  updateConfig: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { config_name, node_type, relation_type, source_table, source_id_column, source_parent_column } = req.body;
      
      const result = await query(
        `UPDATE hierarchy_configs
         SET config_name = $1, node_type = $2, relation_type = $3, source_table = $4, source_id_column = $5, source_parent_column = $6
         WHERE config_id = $7
         RETURNING *`,
        [config_name, node_type, relation_type, source_table, source_id_column, source_parent_column, id]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error updating hierarchy config', error);
      res.status(500).json({ success: false, error: 'Failed to update hierarchy config' });
    }
  },

  deleteConfig: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query('DELETE FROM hierarchy_configs WHERE config_id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting hierarchy config', error);
      res.status(500).json({ success: false, error: 'Failed to delete hierarchy config' });
    }
  },

  syncToNeo4j: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const configResult = await query('SELECT * FROM hierarchy_configs WHERE config_id = $1', [id]);
      if (configResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Config not found' });
      }
      
      const config = configResult.rows[0];
      const dataResult = await query(
        `SELECT ${config.source_id_column}, ${config.source_parent_column} FROM ${config.source_table}`
      );
      
      const session = getSession();
      try {
        // Clear existing nodes and relationships
        await session.run(`MATCH (n:${config.node_type}) DETACH DELETE n`);
        
        // Create nodes
        for (const row of dataResult.rows) {
          await session.run(
            `MERGE (n:${config.node_type} {id: $id}) SET n = $props`,
            {
              id: row[config.source_id_column],
              props: { ...row }
            }
          );
        }
        
        // Create relationships
        if (config.source_parent_column) {
          for (const row of dataResult.rows) {
            if (row[config.source_parent_column]) {
              await session.run(
                `MATCH (child:${config.node_type} {id: $childId})
                 MATCH (parent:${config.node_type} {id: $parentId})
                 MERGE (child)-[:${config.relation_type}]->(parent)`,
                {
                  childId: row[config.source_id_column],
                  parentId: row[config.source_parent_column]
                }
              );
            }
          }
        }
        
        res.json({ success: true, message: 'Hierarchy synced to Neo4j successfully' });
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error('Error syncing hierarchy to Neo4j', error);
      res.status(500).json({ success: false, error: 'Failed to sync hierarchy to Neo4j' });
    }
  },

  getHierarchyTree: async (req: Request, res: Response) => {
    try {
      const { configId } = req.params;
      
      const configResult = await query('SELECT * FROM hierarchy_configs WHERE config_id = $1', [configId]);
      if (configResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Config not found' });
      }
      
      const config = configResult.rows[0];
      const session = getSession();
      
      try {
        const result = await session.run(
          `MATCH path = (root:${config.node_type})-[:${config.relation_type}*]->(leaf:${config.node_type})
           WHERE NOT (root)-[:${config.relation_type}]->()
           RETURN path
           LIMIT 100`
        );
        
        const trees = result.records.map(record => {
          const path = record.get('path');
          return path;
        });
        
        res.json({ success: true, data: trees });
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error('Error fetching hierarchy tree', error);
      res.status(500).json({ success: false, error: 'Failed to fetch hierarchy tree' });
    }
  },

  getAvailableTables: async (req: Request, res: Response) => {
    try {
      const result = await query(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `);
      
      const tables: any = {};
      result.rows.forEach((row: any) => {
        if (!tables[row.table_name]) {
          tables[row.table_name] = [];
        }
        tables[row.table_name].push({
          column_name: row.column_name,
          data_type: row.data_type
        });
      });
      
      res.json({ success: true, data: tables });
    } catch (error) {
      logger.error('Error fetching available tables', error);
      res.status(500).json({ success: false, error: 'Failed to fetch available tables' });
    }
  },
};
