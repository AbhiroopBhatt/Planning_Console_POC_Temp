import { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

dotenv.config();

// Connection pool for pc_postgres_db
// Use Docker container connection - try connecting via docker exec as fallback
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

// Handle connection errors and recreate pool if needed
pcDbPool.on('error', (err) => {
  logger.error('pc_postgres_db pool error', err);
  // Don't recreate pool automatically - let individual queries handle retries
});

// Test connection on startup
pcDbPool.query('SELECT 1')
  .then(() => logger.info('Connected to pc_postgres_db'))
  .catch((err) => {
    logger.error('Failed to connect to pc_postgres_db', err);
    logger.warn('Make sure Docker container is running and accessible');
  });

// Fallback: Use Docker exec if direct connection fails
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

export const dataManagementController = {
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
        
        logger.info(`Fetched ${result.rows.length} tables from pc_postgres_db`);
        res.json({ success: true, data: result.rows });
        return;
      } catch (directError: any) {
        // If direct connection fails, use Docker exec as fallback
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          logger.warn('Direct connection failed, using Docker exec fallback');
          const tables = await getTablesViaDocker();
          logger.info(`Fetched ${tables.length} tables via Docker exec`);
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
        details: error.message,
        code: error.code,
        hint: 'Make sure Docker container "planning_console_postgres" is running'
      });
    }
  },

  getTableData: async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      const { page = '1', limit = '100', search, sortBy, sortOrder, pivotFilters } = req.query;
      
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;

      // Sanitize table name to prevent SQL injection
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        return res.status(400).json({ success: false, error: 'Invalid table name' });
      }

      // Parse pivot filters
      let parsedPivotFilters: Record<string, string[]> = {};
      if (pivotFilters && typeof pivotFilters === 'string') {
        try {
          parsedPivotFilters = JSON.parse(pivotFilters);
          logger.info(`Parsed pivot filters for ${tableName}: ${Object.keys(parsedPivotFilters).length} columns`);
        } catch (e) {
          logger.warn('Failed to parse pivotFilters', e);
        }
      }
      
      logger.debug(`Table data request: ${tableName}, page: ${pageNum}, sortBy: ${sortBy}, sortOrder: ${sortOrder}, filters: ${Object.keys(parsedPivotFilters).length}`);

      // Try direct connection first, fallback to Docker exec
      try {
        await pcDbPool.query('SELECT 1');
        
        // Get column info for validation
        // PostgreSQL stores table names in lowercase in information_schema unless quoted
        const columnsResult = await pcDbPool.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND LOWER(table_name) = LOWER($1)
        `, [tableName]);
        
        if (columnsResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: `Table ${tableName} not found` });
        }
        
        const columnMap = new Map(columnsResult.rows.map((col: any) => [col.column_name.toLowerCase(), col.data_type]));
        
        // Use lowercase table name for query (PostgreSQL is case-insensitive for unquoted identifiers)
        const normalizedTableName = tableName.toLowerCase();
        let query = `SELECT * FROM "${normalizedTableName}"`;
        const params: any[] = [];
        const whereConditions: string[] = [];
        
        if (search) {
          const textColumns = columnsResult.rows
            .filter((col: any) => ['text', 'varchar', 'character varying'].includes(col.data_type))
            .map((col: any) => `"${col.column_name.toLowerCase()}"::text ILIKE $${params.length + 1}`);
          
          if (textColumns.length > 0) {
            params.push(`%${search}%`);
            whereConditions.push(`(${textColumns.join(' OR ')})`);
          }
        }

        // Add pivot filter conditions
        Object.entries(parsedPivotFilters).forEach(([column, values]) => {
          if (values.length > 0) {
            // Normalize column name to lowercase for comparison
            const normalizedColumn = column.toLowerCase();
            if (columnMap.has(normalizedColumn)) {
              const dataType = columnMap.get(normalizedColumn);
              // Sanitize column name (already validated via columnMap)
              const sanitizedColumn = `"${normalizedColumn}"`;
            
            // Check if column is numeric type
            const isNumericType = ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision', 'float', 'float4', 'float8'].some(t => dataType?.includes(t));
            
            if (isNumericType) {
              // Numeric column - use IN clause with numeric values
              const numericValues = values.filter(v => !isNaN(Number(v)) && v !== '').map(v => Number(v));
              if (numericValues.length > 0) {
                const startParam = params.length + 1;
                const placeholders = numericValues.map((_, i) => `$${startParam + i}`).join(', ');
                whereConditions.push(`${sanitizedColumn} IN (${placeholders})`);
                params.push(...numericValues);
              }
            } else {
              // Text or other types - use IN clause with text values
              if (values.length > 0) {
                const startParam = params.length + 1;
                const placeholders = values.map((_, i) => `$${startParam + i}`).join(', ');
                whereConditions.push(`${sanitizedColumn}::text IN (${placeholders})`);
                params.push(...values);
              }
            }
            } else {
              logger.warn(`Filter column ${column} not found in table ${tableName}, skipping filter`);
            }
          }
        });
        
        if (whereConditions.length > 0) {
          query += ` WHERE ${whereConditions.join(' AND ')}`;
          logger.debug(`Applied ${whereConditions.length} filter conditions`);
        }

        // Add sorting
        if (sortBy && typeof sortBy === 'string') {
          // Normalize column name to lowercase for comparison
          const normalizedSortBy = sortBy.toLowerCase();
          if (columnMap.has(normalizedSortBy)) {
            const sanitizedColumn = `"${normalizedSortBy}"`;
            const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
            query += ` ORDER BY ${sanitizedColumn} ${order}`;
            logger.info(`Sorting by ${normalizedSortBy} ${order}`);
          } else {
            logger.warn(`Column ${sortBy} not found in table ${tableName}, using default sort`);
            query += ` ORDER BY 1`;
          }
        } else {
          query += ` ORDER BY 1`;
        }
        
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limitNum, offset);

        logger.debug(`Executing query: ${query.substring(0, 200)}... with ${params.length} params`);
        const result = await pcDbPool.query(query, params);
        logger.info(`Query returned ${result.rows.length} rows`);
        
        // Get total count with same filters
        let countQuery = `SELECT COUNT(*) as total FROM "${normalizedTableName}"`;
        const countParams: any[] = [];
        const countWhereConditions: string[] = [];
        
        if (search) {
          const textColumns = columnsResult.rows
            .filter((col: any) => ['text', 'varchar', 'character varying'].includes(col.data_type))
            .map((col: any) => `"${col.column_name.toLowerCase()}"::text ILIKE $${countParams.length + 1}`);
          
          if (textColumns.length > 0) {
            countParams.push(`%${search}%`);
            countWhereConditions.push(`(${textColumns.join(' OR ')})`);
          }
        }

        // Add pivot filter conditions for count
        Object.entries(parsedPivotFilters).forEach(([column, values]) => {
          if (values.length > 0) {
            const normalizedColumn = column.toLowerCase();
            if (columnMap.has(normalizedColumn)) {
              const dataType = columnMap.get(normalizedColumn);
              const sanitizedColumn = `"${normalizedColumn}"`;
            
            // Check if column is numeric type
            const isNumericType = ['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision', 'float', 'float4', 'float8'].some(t => dataType?.includes(t));
            
            if (isNumericType) {
              const numericValues = values.filter(v => !isNaN(Number(v)) && v !== '').map(v => Number(v));
              if (numericValues.length > 0) {
                const startParam = countParams.length + 1;
                const placeholders = numericValues.map((_, i) => `$${startParam + i}`).join(', ');
                countWhereConditions.push(`${sanitizedColumn} IN (${placeholders})`);
                countParams.push(...numericValues);
              }
            } else {
              if (values.length > 0) {
                const startParam = countParams.length + 1;
                const placeholders = values.map((_, i) => `$${startParam + i}`).join(', ');
                countWhereConditions.push(`${sanitizedColumn}::text IN (${placeholders})`);
                countParams.push(...values);
              }
            }
            } else {
              logger.warn(`Filter column ${column} not found in table ${tableName} for count query, skipping filter`);
            }
          }
        });
        
        if (countWhereConditions.length > 0) {
          countQuery += ` WHERE ${countWhereConditions.join(' AND ')}`;
        }
        
        const countResult = await pcDbPool.query(countQuery, countParams);
        
        res.json({
          success: true,
          data: {
            rows: result.rows,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: parseInt(countResult.rows[0].total),
              totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limitNum)
            }
          }
        });
        return;
      } catch (directError: any) {
        // Fallback to Docker exec - NOTE: This path has limited support for filtering/sorting
        // It's better to ensure direct connection works
        logger.error('Direct connection failed, Docker exec fallback has limited functionality', directError);
        throw new Error(`Database connection failed: ${directError.message}. Please ensure PostgreSQL is accessible.`);
      }
    } catch (error: any) {
      logger.error('Error fetching table data', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch table data',
        details: error.message 
      });
    }
  },

  getTableSchema: async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      
      const result = await pcDbPool.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching table schema', error);
      res.status(500).json({ success: false, error: 'Failed to fetch table schema' });
    }
  },

  getTableCount: async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      
      // Sanitize table name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        return res.status(400).json({ success: false, error: 'Invalid table name' });
      }
      
      const result = await pcDbPool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      
      res.json({ success: true, data: { count: parseInt(result.rows[0].count) } });
    } catch (error) {
      logger.error('Error fetching table count', error);
      res.status(500).json({ success: false, error: 'Failed to fetch table count' });
    }
  }
};

