import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  isAvailable,
  testPostgresConnection,
  testNeo4jConnection,
  createPostgresView,
  createPostgresRemoteTable,
  importNeo4jData,
  query,
  run,
  getDatabase,
  refreshAllRollupViews,
  createFactTableViews
} from '../db/duckdb';

export const duckdbController = {
  /**
   * Get DuckDB status and availability
   */
  getStatus: async (req: Request, res: Response) => {
    try {
      const available = isAvailable();
      
      if (!available) {
        return res.json({
          success: false,
          available: false,
          message: 'DuckDB is not available. Please install DuckDB package.'
        });
      }

      // Test connections
      const postgresConnected = await testPostgresConnection();
      const neo4jConnected = await testNeo4jConnection();

      res.json({
        success: true,
        available: true,
        connections: {
          postgres: {
            connected: postgresConnected,
            host: process.env.POSTGRES_HOST || '127.0.0.1',
            port: process.env.POSTGRES_PORT || '5432',
            database: 'pc_postgres_db'
          },
          neo4j: {
            connected: neo4jConnected,
            uri: process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
            database: process.env.NEO4J_DATABASE || 'pc-neo4j-poc'
          }
        },
        message: 'DuckDB is available and ready'
      });
    } catch (error: any) {
      logger.error('Error getting DuckDB status', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get DuckDB status',
        details: error.message
      });
    }
  },

  /**
   * Test PostgreSQL connection from DuckDB
   */
  testPostgres: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const connected = await testPostgresConnection();
      
      res.json({
        success: connected,
        message: connected 
          ? 'PostgreSQL connection successful' 
          : 'PostgreSQL connection failed'
      });
    } catch (error: any) {
      logger.error('Error testing PostgreSQL connection', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test PostgreSQL connection',
        details: error.message
      });
    }
  },

  /**
   * Test Neo4j connection
   */
  testNeo4j: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const connected = await testNeo4jConnection();
      
      res.json({
        success: connected,
        message: connected 
          ? 'Neo4j connection successful' 
          : 'Neo4j connection failed'
      });
    } catch (error: any) {
      logger.error('Error testing Neo4j connection', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test Neo4j connection',
        details: error.message
      });
    }
  },

  /**
   * Create a view from PostgreSQL table
   */
  createPostgresView: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { tableName, schema, viewName } = req.body;

      if (!tableName) {
        return res.status(400).json({
          success: false,
          error: 'tableName is required'
        });
      }

      await createPostgresView(tableName, schema || 'public', viewName);

      res.json({
        success: true,
        message: `View created successfully: ${viewName || `${tableName}_view`}`,
        viewName: viewName || `${tableName}_view`,
        sourceTable: `${schema || 'public'}.${tableName}`
      });
    } catch (error: any) {
      logger.error('Error creating PostgreSQL view in DuckDB', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create PostgreSQL view',
        details: error.message
      });
    }
  },

  /**
   * Create a remote table from PostgreSQL (copies data)
   */
  createPostgresTable: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { tableName, schema, duckdbTableName } = req.body;

      if (!tableName) {
        return res.status(400).json({
          success: false,
          error: 'tableName is required'
        });
      }

      await createPostgresRemoteTable(tableName, schema || 'public', duckdbTableName);

      res.json({
        success: true,
        message: `Remote table created successfully: ${duckdbTableName || tableName}`,
        duckdbTableName: duckdbTableName || tableName,
        sourceTable: `${schema || 'public'}.${tableName}`
      });
    } catch (error: any) {
      logger.error('Error creating PostgreSQL table in DuckDB', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create PostgreSQL table',
        details: error.message
      });
    }
  },

  /**
   * Import data from Neo4j into DuckDB
   */
  importNeo4jData: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { cypherQuery, tableName, clearExisting } = req.body;

      if (!cypherQuery || !tableName) {
        return res.status(400).json({
          success: false,
          error: 'cypherQuery and tableName are required'
        });
      }

      await importNeo4jData(cypherQuery, tableName, { clearExisting: clearExisting || false });

      res.json({
        success: true,
        message: `Data imported from Neo4j into DuckDB table: ${tableName}`,
        tableName
      });
    } catch (error: any) {
      logger.error('Error importing Neo4j data into DuckDB', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import Neo4j data',
        details: error.message
      });
    }
  },

  /**
   * Execute a query in DuckDB
   */
  executeQuery: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { sql } = req.body;

      if (!sql) {
        return res.status(400).json({
          success: false,
          error: 'SQL query is required'
        });
      }

      const result = await query(sql, []);

      // Serialize BigInt values to prevent JSON serialization errors
      const serializeBigInt = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') {
          if (obj <= Number.MAX_SAFE_INTEGER && obj >= Number.MIN_SAFE_INTEGER) {
            return Number(obj);
          }
          return obj.toString();
        }
        if (Array.isArray(obj)) return obj.map(serializeBigInt);
        if (typeof obj === 'object') {
          const result: any = {};
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              result[key] = serializeBigInt(obj[key]);
            }
          }
          return result;
        }
        return obj;
      };

      const serializedResult = serializeBigInt(result);

      res.json({
        success: true,
        data: serializedResult,
        rowCount: serializedResult.length
      });
    } catch (error: any) {
      logger.error('Error executing DuckDB query', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute query',
        details: error.message
      });
    }
  },

  /**
   * List all tables in DuckDB
   */
  listTables: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      // Use SHOW TABLES to get all tables and views
      const tablesResult = await query(`SHOW TABLES`);
      
      logger.info('DuckDB SHOW TABLES result', { result: tablesResult, length: tablesResult?.length });
      
      // SHOW TABLES returns an array of objects
      // The structure can vary, so we need to handle different formats
      let tables: any[] = [];
      
      if (Array.isArray(tablesResult) && tablesResult.length > 0) {
        // Check the structure of the first item
        const firstItem = tablesResult[0];
        
        if (typeof firstItem === 'string') {
          // If it's an array of strings
          tables = tablesResult.map((t: string) => ({
            name: t,
            type: 'TABLE'
          }));
        } else if (firstItem && typeof firstItem === 'object') {
          // If it's an array of objects, try different property names
          tables = tablesResult.map((t: any) => {
            const name = t.name || t.table_name || t.Name || t['name'] || Object.values(t)[0] || '';
            return {
              name: String(name),
              type: t.type || t.table_type || 'TABLE'
            };
          }).filter((t: any) => t.name && t.name !== '');
        }
      }

      logger.info('Parsed DuckDB tables', { tables, count: tables.length });

      res.json({
        success: true,
        data: tables
      });
    } catch (error: any) {
      logger.error('Error listing DuckDB tables', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list tables',
        details: error.message
      });
    }
  },

  /**
   * Get data from a DuckDB table/view
   */
  getTableData: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { tableName } = req.params;
      const { page = '1', limit = '50', search = '', sortBy, sortOrder, pivotFilters } = req.query;

      if (!tableName) {
        return res.status(400).json({
          success: false,
          error: 'Table name is required'
        });
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const offset = (pageNum - 1) * limitNum;

      // Parse pivot filters
      let parsedPivotFilters: Record<string, string[]> = {};
      if (pivotFilters && typeof pivotFilters === 'string') {
        try {
          parsedPivotFilters = JSON.parse(pivotFilters);
        } catch (e) {
          logger.warn('Failed to parse pivotFilters', e);
        }
      }

      // Get column info first
      const columnsResult = await query(`DESCRIBE ${tableName}`);
      const columns = columnsResult.map((c: any) => c.column_name || c.name || c);
      const columnTypes = new Map(
        columnsResult.map((c: any) => [
          c.column_name || c.name || c,
          (c.column_type || c.type || 'VARCHAR').toUpperCase()
        ])
      );

      const whereConditions: string[] = [];

      // Add search conditions
      if (search) {
        if (columns.length > 0) {
          const searchConditions = columns.map((col: string) => 
            `CAST(${col} AS VARCHAR) LIKE '%${search.toString().replace(/'/g, "''")}%'`
          ).join(' OR ');
          whereConditions.push(`(${searchConditions})`);
        }
      }

      // Add pivot filter conditions
      Object.entries(parsedPivotFilters).forEach(([column, values]) => {
        if (values.length > 0 && columns.includes(column)) {
          const colType = columnTypes.get(column) || 'VARCHAR';
          if (colType.includes('INT') || colType.includes('NUMERIC') || colType.includes('DECIMAL') || colType.includes('REAL') || colType.includes('DOUBLE') || colType.includes('FLOAT')) {
            // Numeric column
            const numericValues = values.filter(v => !isNaN(Number(v))).map(v => Number(v));
            if (numericValues.length > 0) {
              whereConditions.push(`${column} IN (${numericValues.join(',')})`);
            }
          } else {
            // Text or other types
            const escapedValues = values.map(v => `'${v.toString().replace(/'/g, "''")}'`).join(',');
            whereConditions.push(`CAST(${column} AS VARCHAR) IN (${escapedValues})`);
          }
        }
      });

      // Build WHERE clause
      const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';

      // First, get total count
      let countQuery = `SELECT COUNT(*) as total FROM ${tableName}${whereClause}`;
      const countResult = await query(countQuery);
      const totalValue = countResult[0]?.total || countResult[0]?.['COUNT(*)'] || 0;
      let total: number = 0;
      if (typeof totalValue === 'bigint') {
        total = totalValue <= Number.MAX_SAFE_INTEGER ? Number(totalValue) : parseInt(totalValue.toString(), 10);
      } else {
        total = Number(totalValue) || 0;
      }

      // Get data with pagination
      let dataQuery = `SELECT * FROM ${tableName}${whereClause}`;
      
      // Add sorting
      if (sortBy && typeof sortBy === 'string' && columns.includes(sortBy)) {
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        dataQuery += ` ORDER BY ${sortBy} ${order}`;
      } else {
        dataQuery += ` ORDER BY 1`;
      }
      
      dataQuery += ` LIMIT ${limitNum} OFFSET ${offset}`;

      const rows = await query(dataQuery);

      // Serialize BigInt values to prevent JSON serialization errors
      const serializeBigInt = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') {
          if (obj <= Number.MAX_SAFE_INTEGER && obj >= Number.MIN_SAFE_INTEGER) {
            return Number(obj);
          }
          return obj.toString();
        }
        if (Array.isArray(obj)) return obj.map(serializeBigInt);
        if (typeof obj === 'object') {
          const result: any = {};
          for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              result[key] = serializeBigInt(obj[key]);
            }
          }
          return result;
        }
        return obj;
      };

      const serializedRows = serializeBigInt(rows);
      
      // Double-check: serialize the entire response object to catch any remaining BigInt values
      const responseObj = {
        success: true,
        data: {
          rows: serializedRows,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: total,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      };
      
      // Final serialization pass to ensure no BigInt values remain
      const finalResponse = serializeBigInt(responseObj);
      
      res.json(finalResponse);
    } catch (error: any) {
      logger.error('Error getting DuckDB table data', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get table data',
        details: error.message
      });
    }
  },

  /**
   * Get schema for a DuckDB table/view
   */
  getTableSchema: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { tableName } = req.params;

      if (!tableName) {
        return res.status(400).json({
          success: false,
          error: 'Table name is required'
        });
      }

      // Use DESCRIBE to get column information
      const schemaResult = await query(`DESCRIBE ${tableName}`);
      
      const columns = schemaResult.map((col: any) => ({
        column_name: col.column_name || col.name || col,
        data_type: col.column_type || col.type || col.data_type || 'VARCHAR',
        null: col.null || 'YES'
      }));

      res.json({
        success: true,
        data: columns
      });
    } catch (error: any) {
      logger.error('Error getting DuckDB table schema', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get table schema',
        details: error.message
      });
    }
  },

  /**
   * Refresh all hierarchy rollup views
   */
  refreshRollupViews: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      logger.info('Manual refresh of rollup views requested');
      await refreshAllRollupViews();

      res.json({
        success: true,
        message: 'All rollup views refreshed successfully'
      });
    } catch (error: any) {
      logger.error('Error refreshing rollup views', error);
      res.status(500).json({
        success: false,
        error: 'Failed to refresh rollup views',
        details: error.message
      });
    }
  },

  /**
   * Create/refresh fact table materialized views
   */
  createFactTableViews: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      logger.info('Creating/refreshing fact table views requested');
      await createFactTableViews();

      res.json({
        success: true,
        message: 'Fact table views created/refreshed successfully',
        views: [
          'Prices_allcombo_view',
          'Costs_allcombo_view',
          'Basevolume_allcombo_view'
        ]
      });
    } catch (error: any) {
      logger.error('Error creating fact table views', error);
      const errorMessage = error.message || 'Unknown error occurred';
      res.status(500).json({
        success: false,
        error: 'Failed to create fact table views',
        details: errorMessage,
        hint: errorMessage.includes('rollup') || errorMessage.includes('customer_rollup') 
          ? 'Please build the graph first in Hierarchy Management to create rollup views.'
          : undefined
      });
    }
  },

  /**
   * Get prices report from DuckDB Prices_allcombo_view
   * Supports filtering by customer, category, brand, product, and time
   */
  getPricesReport: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { customerIds, categoryIds, brandIds, productIds, timeIds } = req.query;
      
      // Parse filter IDs
      const selectedCustomerIds = customerIds 
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedCategoryIds = categoryIds
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedBrandIds = brandIds
        ? (Array.isArray(brandIds) ? brandIds : brandIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedProductIds = productIds
        ? (Array.isArray(productIds) ? productIds : productIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedTimeIds = timeIds
        ? (Array.isArray(timeIds) ? timeIds : timeIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      // Build SQL query for Prices_allcombo_view
      let sqlQuery = `
        SELECT 
          price_id,
          product_id,
          sku_name,
          barcode,
          category_id,
          brand_id,
          customer_id,
          rollup_customer_id,
          time_id,
          date,
          year,
          quarter,
          month,
          week,
          day,
          list_price,
          customer_price,
          base_price,
          promo_price,
          has_data
        FROM Prices_allcombo_view
        WHERE 1=1
      `;

      const conditions: string[] = [];

      // Apply filters
      if (selectedCustomerIds.length > 0) {
        conditions.push(`customer_id IN (${selectedCustomerIds.join(',')})`);
      }

      if (selectedCategoryIds.length > 0) {
        conditions.push(`category_id IN (${selectedCategoryIds.join(',')})`);
      }

      if (selectedBrandIds.length > 0) {
        conditions.push(`brand_id IN (${selectedBrandIds.join(',')})`);
      }

      if (selectedProductIds.length > 0) {
        conditions.push(`product_id IN (${selectedProductIds.join(',')})`);
      }

      if (selectedTimeIds.length > 0) {
        conditions.push(`time_id IN (${selectedTimeIds.join(',')})`);
      }

      if (conditions.length > 0) {
        sqlQuery += ` AND ${conditions.join(' AND ')}`;
      }

      sqlQuery += ` ORDER BY product_id, customer_id, date`;

      logger.info('Executing DuckDB prices query', { 
        selectedCustomerIds: selectedCustomerIds.length,
        selectedCategoryIds: selectedCategoryIds.length,
        selectedBrandIds: selectedBrandIds.length,
        selectedProductIds: selectedProductIds.length,
        selectedTimeIds: selectedTimeIds.length
      });

      const startTime = Date.now();
      const result = await query(sqlQuery);
      const executionTime = Date.now() - startTime;

      // Calculate statistics
      const customerSet = new Set<number>();
      const productSet = new Set<number>();
      const categorySet = new Set<number>();
      const brandSet = new Set<number>();
      let totalListPrice = 0;
      let totalCustomerPrice = 0;
      let totalBasePrice = 0;
      let totalPromoPrice = 0;
      let recordsWithData = 0;

      result.forEach((row: any) => {
        if (row.customer_id) customerSet.add(row.customer_id);
        if (row.product_id) productSet.add(row.product_id);
        if (row.category_id) categorySet.add(row.category_id);
        if (row.brand_id) brandSet.add(row.brand_id);
        
        if (row.has_data === 1) {
          recordsWithData++;
          if (row.list_price) totalListPrice += Number(row.list_price);
          if (row.customer_price) totalCustomerPrice += Number(row.customer_price);
          if (row.base_price) totalBasePrice += Number(row.base_price);
          if (row.promo_price) totalPromoPrice += Number(row.promo_price);
        }
      });

      logger.info('DuckDB prices query successful', { 
        rowCount: result.length, 
        executionTime,
        recordsWithData
      });

      res.json({
        success: true,
        data: {
          prices: result,
          totalRecords: result.length,
          recordsWithData: recordsWithData,
          recordsWithoutData: result.length - recordsWithData,
          customerCount: customerSet.size,
          productCount: productSet.size,
          categoryCount: categorySet.size,
          brandCount: brandSet.size,
          totals: {
            listPrice: totalListPrice,
            customerPrice: totalCustomerPrice,
            basePrice: totalBasePrice,
            promoPrice: totalPromoPrice
          },
          executionTimeMs: executionTime
        }
      });
    } catch (error: any) {
      logger.error('Error getting DuckDB prices report', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get prices report',
        details: error.message
      });
    }
  },

  /**
   * Get costs report from DuckDB Costs_allcombo_view
   * Supports filtering by customer, category, brand, product, and time
   */
  getCostsReport: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { customerIds, categoryIds, brandIds, productIds, timeIds } = req.query;
      
      // Parse filter IDs
      const selectedCustomerIds = customerIds 
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedCategoryIds = categoryIds
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedBrandIds = brandIds
        ? (Array.isArray(brandIds) ? brandIds : brandIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedProductIds = productIds
        ? (Array.isArray(productIds) ? productIds : productIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedTimeIds = timeIds
        ? (Array.isArray(timeIds) ? timeIds : timeIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      // Build SQL query for Costs_allcombo_view
      let sqlQuery = `
        SELECT 
          cost_id,
          product_id,
          sku_name,
          barcode,
          category_id,
          brand_id,
          customer_id,
          rollup_customer_id,
          time_id,
          date,
          year,
          quarter,
          month,
          week,
          day,
          cogs,
          logs,
          has_data
        FROM Costs_allcombo_view
        WHERE 1=1
      `;

      const conditions: string[] = [];

      // Apply filters
      if (selectedCustomerIds.length > 0) {
        conditions.push(`customer_id IN (${selectedCustomerIds.join(',')})`);
      }

      if (selectedCategoryIds.length > 0) {
        conditions.push(`category_id IN (${selectedCategoryIds.join(',')})`);
      }

      if (selectedBrandIds.length > 0) {
        conditions.push(`brand_id IN (${selectedBrandIds.join(',')})`);
      }

      if (selectedProductIds.length > 0) {
        conditions.push(`product_id IN (${selectedProductIds.join(',')})`);
      }

      if (selectedTimeIds.length > 0) {
        conditions.push(`time_id IN (${selectedTimeIds.join(',')})`);
      }

      if (conditions.length > 0) {
        sqlQuery += ` AND ${conditions.join(' AND ')}`;
      }

      sqlQuery += ` ORDER BY product_id, customer_id, date`;

      logger.info('Executing DuckDB costs query', { 
        selectedCustomerIds: selectedCustomerIds.length,
        selectedCategoryIds: selectedCategoryIds.length,
        selectedBrandIds: selectedBrandIds.length,
        selectedProductIds: selectedProductIds.length,
        selectedTimeIds: selectedTimeIds.length
      });

      const startTime = Date.now();
      const result = await query(sqlQuery);
      const executionTime = Date.now() - startTime;

      // Calculate statistics
      const customerSet = new Set<number>();
      const productSet = new Set<number>();
      const categorySet = new Set<number>();
      const brandSet = new Set<number>();
      let totalCogs = 0;
      let totalLogs = 0;
      let recordsWithData = 0;

      result.forEach((row: any) => {
        if (row.customer_id) customerSet.add(row.customer_id);
        if (row.product_id) productSet.add(row.product_id);
        if (row.category_id) categorySet.add(row.category_id);
        if (row.brand_id) brandSet.add(row.brand_id);
        
        if (row.has_data === 1) {
          recordsWithData++;
          if (row.cogs) totalCogs += Number(row.cogs);
          if (row.logs) totalLogs += Number(row.logs);
        }
      });

      logger.info('DuckDB costs query successful', { 
        rowCount: result.length, 
        executionTime,
        recordsWithData
      });

      res.json({
        success: true,
        data: {
          costs: result,
          totalRecords: result.length,
          recordsWithData: recordsWithData,
          recordsWithoutData: result.length - recordsWithData,
          customerCount: customerSet.size,
          productCount: productSet.size,
          categoryCount: categorySet.size,
          brandCount: brandSet.size,
          totals: {
            cogs: totalCogs,
            logs: totalLogs
          },
          executionTimeMs: executionTime
        }
      });
    } catch (error: any) {
      logger.error('Error fetching DuckDB costs report', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch costs report',
        details: error.message
      });
    }
  },

  /**
   * Get base volumes report from DuckDB Basevolume_allcombo_view
   * Supports filtering by customer, category, brand, product, and time
   */
  getBaseVolumesReport: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { customerIds, categoryIds, brandIds, productIds, timeIds } = req.query;
      
      // Parse filter IDs
      const selectedCustomerIds = customerIds 
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedCategoryIds = categoryIds
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedBrandIds = brandIds
        ? (Array.isArray(brandIds) ? brandIds : brandIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      
      const selectedProductIds = productIds
        ? (Array.isArray(productIds) ? productIds : productIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      const selectedTimeIds = timeIds
        ? (Array.isArray(timeIds) ? timeIds : timeIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      // Build SQL query for Basevolume_allcombo_view
      let sqlQuery = `
        SELECT 
          base_volume_id,
          product_id,
          sku_name,
          barcode,
          category_id,
          brand_id,
          customer_id,
          rollup_customer_id,
          time_id,
          date,
          year,
          quarter,
          month,
          week,
          day,
          volume,
          has_data
        FROM Basevolume_allcombo_view
        WHERE 1=1
      `;

      const conditions: string[] = [];

      // Apply filters
      if (selectedCustomerIds.length > 0) {
        conditions.push(`customer_id IN (${selectedCustomerIds.join(',')})`);
      }

      if (selectedCategoryIds.length > 0) {
        conditions.push(`category_id IN (${selectedCategoryIds.join(',')})`);
      }

      if (selectedBrandIds.length > 0) {
        conditions.push(`brand_id IN (${selectedBrandIds.join(',')})`);
      }

      if (selectedProductIds.length > 0) {
        conditions.push(`product_id IN (${selectedProductIds.join(',')})`);
      }

      if (selectedTimeIds.length > 0) {
        conditions.push(`time_id IN (${selectedTimeIds.join(',')})`);
      }

      if (conditions.length > 0) {
        sqlQuery += ` AND ${conditions.join(' AND ')}`;
      }

      sqlQuery += ` ORDER BY product_id, customer_id, date`;

      logger.info('Executing DuckDB base volumes query', { 
        selectedCustomerIds: selectedCustomerIds.length,
        selectedCategoryIds: selectedCategoryIds.length,
        selectedBrandIds: selectedBrandIds.length,
        selectedProductIds: selectedProductIds.length,
        selectedTimeIds: selectedTimeIds.length
      });

      const startTime = Date.now();
      const result = await query(sqlQuery);
      const executionTime = Date.now() - startTime;

      // Calculate statistics
      const customerSet = new Set<number>();
      const productSet = new Set<number>();
      const categorySet = new Set<number>();
      const brandSet = new Set<number>();
      let totalVolume = 0;
      let recordsWithData = 0;

      result.forEach((row: any) => {
        if (row.customer_id) customerSet.add(row.customer_id);
        if (row.product_id) productSet.add(row.product_id);
        if (row.category_id) categorySet.add(row.category_id);
        if (row.brand_id) brandSet.add(row.brand_id);
        
        if (row.has_data === 1) {
          recordsWithData++;
          if (row.volume) totalVolume += Number(row.volume);
        }
      });

      logger.info('DuckDB base volumes query successful', { 
        rowCount: result.length, 
        executionTime,
        recordsWithData
      });

      res.json({
        success: true,
        data: {
          volumes: result,
          totalRecords: result.length,
          recordsWithData: recordsWithData,
          recordsWithoutData: result.length - recordsWithData,
          customerCount: customerSet.size,
          productCount: productSet.size,
          categoryCount: categorySet.size,
          brandCount: brandSet.size,
          totals: {
            volume: totalVolume
          },
          executionTimeMs: executionTime
        }
      });
    } catch (error: any) {
      logger.error('Error fetching DuckDB base volumes report', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch DuckDB base volumes report',
        details: error.message
      });
    }
  },

  /**
   * Clear all DuckDB views and tables
   */
  clearAllDuckDB: async (req: Request, res: Response) => {
    try {
      if (!isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'DuckDB is not available'
        });
      }

      const { clearAllDuckDBViewsAndTables } = await import('../db/duckdb');
      await clearAllDuckDBViewsAndTables();

      res.json({
        success: true,
        message: 'All DuckDB views and tables cleared successfully'
      });
    } catch (error: any) {
      logger.error('Error clearing DuckDB', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to clear DuckDB',
        details: error.message
      });
    }
  },

  /**
   * Clear all Neo4j graph data
   */
  clearAllNeo4j: async (req: Request, res: Response) => {
    try {
      const { clearAllNeo4jData } = await import('../db/neo4j');
      await clearAllNeo4jData();

      res.json({
        success: true,
        message: 'All Neo4j nodes and relationships cleared successfully'
      });
    } catch (error: any) {
      logger.error('Error clearing Neo4j', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to clear Neo4j',
        details: error.message
      });
    }
  },

  /**
   * Clear both DuckDB and Neo4j (full reset)
   */
  clearAll: async (req: Request, res: Response) => {
    try {
      const { clearAllDuckDBViewsAndTables } = await import('../db/duckdb');
      const { clearAllNeo4jData } = await import('../db/neo4j');

      // Clear DuckDB first
      if (isAvailable()) {
        await clearAllDuckDBViewsAndTables();
      }

      // Clear Neo4j
      await clearAllNeo4jData();

      res.json({
        success: true,
        message: 'All DuckDB views/tables and Neo4j data cleared successfully'
      });
    } catch (error: any) {
      logger.error('Error clearing all data', {
        error: error.message,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to clear all data',
        details: error.message
      });
    }
  }
};

