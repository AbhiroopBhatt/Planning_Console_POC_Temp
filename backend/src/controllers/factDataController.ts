import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSession } from '../db/neo4j';
import { Pool } from 'pg';
import dotenv from 'dotenv';

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

// Helper function to fetch data via Docker exec
async function fetchDataViaDocker(query: string): Promise<any[]> {
  try {
    const { stdout } = await execAsync(
      `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
    );
    const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
    return lines;
  } catch (error: any) {
    logger.error('Docker exec query failed', error);
    throw error;
  }
}

export const factDataController = {
  /**
   * Get region hierarchy from Neo4j (with PostgreSQL fallback)
   */
  getRegionHierarchy: async (req: Request, res: Response) => {
    try {
      // Try Neo4j first
      try {
        const session = getSession();
        try {
          // Try both possible node labels (Region_H and region_h)
          let result = await session.run(`
            MATCH (r)
            WHERE (r:Region_H OR r:region_h)
            OPTIONAL MATCH (r)-[:Has_Parent_Region]->(p)
            WHERE (p:Region_H OR p:region_h)
            RETURN r.region_id as region_id, 
                   r.region_name as region_name,
                   r.parent_region_id as parent_region_id,
                   p.region_id as parent_id,
                   p.region_name as parent_name
            ORDER BY r.region_id
          `);
          
          // If no results, try with lowercase label
          if (result.records.length === 0) {
            result = await session.run(`
              MATCH (r:region_h)
              OPTIONAL MATCH (r)-[:Has_Parent_Region]->(p:region_h)
              RETURN r.region_id as region_id, 
                     r.region_name as region_name,
                     r.parent_region_id as parent_region_id,
                     p.region_id as parent_id,
                     p.region_name as parent_name
              ORDER BY r.region_id
            `);
          }

          const regions = result.records.map(record => ({
            region_id: Number(record.get('region_id')) || 0,
            region_name: String(record.get('region_name') || ''),
            parent_region_id: record.get('parent_region_id') ? Number(record.get('parent_region_id')) : null,
            parent_id: record.get('parent_id') ? Number(record.get('parent_id')) : null,
            parent_name: record.get('parent_name') ? String(record.get('parent_name')) : null,
          }));

          // If we got data from Neo4j, use it
          if (regions.length > 0) {
            // Build hierarchy tree
            const regionMap = new Map();
            const rootRegions: any[] = [];

            regions.forEach(region => {
              regionMap.set(region.region_id, {
                ...region,
                children: []
              });
            });

            regions.forEach(region => {
              const regionNode = regionMap.get(region.region_id);
              if (region.parent_region_id) {
                const parent = regionMap.get(region.parent_region_id);
                if (parent) {
                  parent.children.push(regionNode);
                } else {
                  rootRegions.push(regionNode);
                }
              } else {
                rootRegions.push(regionNode);
              }
            });

            await session.close();
            return res.json({
              success: true,
              data: {
                regions: regions,
                hierarchy: rootRegions
              }
            });
          }
          await session.close();
        } catch (neo4jError: any) {
          logger.warn('Neo4j query failed, falling back to PostgreSQL', neo4jError);
        }
      } catch (sessionError: any) {
        logger.warn('Neo4j session error, falling back to PostgreSQL', sessionError);
      }

      // Fallback to PostgreSQL
      try {
        await pcDbPool.query('SELECT 1');
        const result = await pcDbPool.query(`
          SELECT region_id, region_name, parent_region_id 
          FROM region_h 
          ORDER BY region_id
        `);
        
        const regions = result.rows.map(row => ({
          region_id: Number(row.region_id) || 0,
          region_name: String(row.region_name || ''),
          parent_region_id: row.parent_region_id ? Number(row.parent_region_id) : null,
          parent_id: row.parent_region_id ? Number(row.parent_region_id) : null,
          parent_name: null
        }));

        // Build hierarchy tree
        const regionMap = new Map();
        const rootRegions: any[] = [];

        regions.forEach(region => {
          regionMap.set(region.region_id, {
            ...region,
            children: []
          });
        });

        regions.forEach(region => {
          const regionNode = regionMap.get(region.region_id);
          if (region.parent_region_id) {
            const parent = regionMap.get(region.parent_region_id);
            if (parent) {
              parent.children.push(regionNode);
            } else {
              rootRegions.push(regionNode);
            }
          } else {
            rootRegions.push(regionNode);
          }
        });

        return res.json({
          success: true,
          data: {
            regions: regions,
            hierarchy: rootRegions
          }
        });
      } catch (pgError: any) {
        if (pgError.code === '28000' || pgError.message?.includes('does not exist')) {
          // Try Docker exec fallback
          const query = 'SELECT region_id, region_name, parent_region_id FROM region_h ORDER BY region_id';
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"')}"`
          );
          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
          const regions = lines.map(line => {
            const [region_id, region_name, parent_region_id] = line.split('|');
            return {
              region_id: parseInt(region_id) || 0,
              region_name: region_name || '',
              parent_region_id: parent_region_id ? parseInt(parent_region_id) : null,
              parent_id: parent_region_id ? parseInt(parent_region_id) : null,
              parent_name: null
            };
          });

          // Build hierarchy tree
          const regionMap = new Map();
          const rootRegions: any[] = [];

          regions.forEach(region => {
            regionMap.set(region.region_id, {
              ...region,
              children: []
            });
          });

          regions.forEach(region => {
            const regionNode = regionMap.get(region.region_id);
            if (region.parent_region_id) {
              const parent = regionMap.get(region.parent_region_id);
              if (parent) {
                parent.children.push(regionNode);
              } else {
                rootRegions.push(regionNode);
              }
            } else {
              rootRegions.push(regionNode);
            }
          });

          return res.json({
            success: true,
            data: {
              regions: regions,
              hierarchy: rootRegions
            }
          });
        }
        throw pgError;
      }
    } catch (error: any) {
      logger.error('Error fetching region hierarchy', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch region hierarchy',
        details: error.message
      });
    }
  },

  /**
   * Get all channels from Channel_M table
   */
  getChannels: async (req: Request, res: Response) => {
    try {
      try {
        await pcDbPool.query('SELECT 1');
        const result = await pcDbPool.query('SELECT channel_id, channel_name FROM channel_m ORDER BY channel_id');
        res.json({ success: true, data: result.rows });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          const query = 'SELECT channel_id, channel_name FROM channel_m ORDER BY channel_id';
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"')}"`
          );
          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
          const channels = lines.map(line => {
            const [channel_id, channel_name] = line.split('|');
            return {
              channel_id: parseInt(channel_id) || 0,
              channel_name: channel_name || ''
            };
          });
          res.json({ success: true, data: channels });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching channels', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch channels',
        details: error.message
      });
    }
  },
  /**
   * Get customer hierarchy from Neo4j
   */
  getCustomerHierarchy: async (req: Request, res: Response) => {
    try {
      const session = getSession();
      try {
        // Get all customer nodes and their parent relationships
        // Relationship is (child)-[:Has_Parent_Cust]->(parent)
        const result = await session.run(`
          MATCH (c:customer_h)
          OPTIONAL MATCH (c)-[:Has_Parent_Cust]->(p:customer_h)
          RETURN c.customer_id as customer_id, 
                 c.customer_name as customer_name,
                 c.parent_customer_id as parent_customer_id,
                 p.customer_id as parent_id,
                 p.customer_name as parent_name
          ORDER BY c.customer_id
        `);

        const customers = result.records.map(record => {
          const getValue = (key: string, asNumber: boolean = false) => {
            const value = record.get(key);
            if (value === null || value === undefined) return null;
            if (asNumber) {
              return Number(value);
            }
            return String(value);
          };

          return {
            customer_id: Number(record.get('customer_id')) || 0,
            customer_name: String(record.get('customer_name') || ''),
            parent_customer_id: record.get('parent_customer_id') ? Number(record.get('parent_customer_id')) : null,
            parent_id: record.get('parent_id') ? Number(record.get('parent_id')) : null,
            parent_name: record.get('parent_name') ? String(record.get('parent_name')) : null,
          };
        });

        // Build hierarchy tree
        const customerMap = new Map();
        const rootCustomers: any[] = [];

        // First pass: create all customer nodes
        customers.forEach(customer => {
          customerMap.set(customer.customer_id, {
            ...customer,
            children: []
          });
        });

        // Second pass: build parent-child relationships
        customers.forEach(customer => {
          const customerNode = customerMap.get(customer.customer_id);
          if (customer.parent_customer_id) {
            const parent = customerMap.get(customer.parent_customer_id);
            if (parent) {
              parent.children.push(customerNode);
            } else {
              rootCustomers.push(customerNode);
            }
          } else {
            rootCustomers.push(customerNode);
          }
        });

        res.json({
          success: true,
          data: {
            customers: customers,
            hierarchy: rootCustomers
          }
        });
      } finally {
        await session.close();
      }
    } catch (error: any) {
      logger.error('Error fetching customer hierarchy', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch customer hierarchy',
        details: error.message
      });
    }
  },

  /**
   * Get category hierarchy from Neo4j
   */
  getCategoryHierarchy: async (req: Request, res: Response) => {
    logger.info('getCategoryHierarchy called');
    try {
      const session = getSession();
      try {
        // Get all category nodes and their parent relationships
        // Relationship is (child)-[:Has_Parent_Cat]->(parent)
        logger.info('Executing Neo4j query for categories');
        const result = await session.run(`
          MATCH (c:category_h)
          OPTIONAL MATCH (c)-[:Has_Parent_Cat]->(p:category_h)
          RETURN c.category_id as category_id, 
                 c.category_name as category_name,
                 c.parent_category_id as parent_category_id,
                 p.category_id as parent_id,
                 p.category_name as parent_name
          ORDER BY c.category_id
        `);

        const categories = result.records.map(record => ({
          category_id: Number(record.get('category_id')) || 0,
          category_name: String(record.get('category_name') || ''),
          parent_category_id: record.get('parent_category_id') ? Number(record.get('parent_category_id')) : null,
          parent_id: record.get('parent_id') ? Number(record.get('parent_id')) : null,
          parent_name: record.get('parent_name') ? String(record.get('parent_name')) : null,
        }));

        // Build hierarchy tree
        const categoryMap = new Map();
        const rootCategories: any[] = [];

        // First pass: create all category nodes
        categories.forEach(category => {
          categoryMap.set(category.category_id, {
            ...category,
            children: []
          });
        });

        // Second pass: build parent-child relationships
        categories.forEach(category => {
          const categoryNode = categoryMap.get(category.category_id);
          if (category.parent_category_id) {
            const parent = categoryMap.get(category.parent_category_id);
            if (parent) {
              parent.children.push(categoryNode);
            } else {
              rootCategories.push(categoryNode);
            }
          } else {
            rootCategories.push(categoryNode);
          }
        });

        res.json({
          success: true,
          data: {
            categories: categories,
            hierarchy: rootCategories
          }
        });
      } finally {
        await session.close();
      }
    } catch (error: any) {
      logger.error('Error fetching category hierarchy', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch category hierarchy',
        details: error.message
      });
    }
  },

  /**
   * Get brand hierarchy from Neo4j
   */
  getBrandHierarchy: async (req: Request, res: Response) => {
    logger.info('getBrandHierarchy called');
    try {
      const session = getSession();
      try {
        // Get all brand nodes and their parent relationships
        // Relationship is (child)-[:Has_Parent_Brand]->(parent)
        logger.info('Executing Neo4j query for brands');
        const result = await session.run(`
          MATCH (c:brand_h)
          OPTIONAL MATCH (c)-[:Has_Parent_Brand]->(p:brand_h)
          RETURN c.brand_id as brand_id, 
                 c.brand_name as brand_name,
                 c.parent_brand_id as parent_brand_id,
                 p.brand_id as parent_id,
                 p.brand_name as parent_name
          ORDER BY c.brand_id
        `);

        const brands = result.records.map(record => ({
          brand_id: Number(record.get('brand_id')) || 0,
          brand_name: String(record.get('brand_name') || ''),
          parent_brand_id: record.get('parent_brand_id') ? Number(record.get('parent_brand_id')) : null,
          parent_id: record.get('parent_id') ? Number(record.get('parent_id')) : null,
          parent_name: record.get('parent_name') ? String(record.get('parent_name')) : null,
        }));

        // Build hierarchy tree
        const brandMap = new Map();
        const rootBrands: any[] = [];

        // First pass: create all brand nodes
        brands.forEach(brand => {
          brandMap.set(brand.brand_id, {
            ...brand,
            children: []
          });
        });

        // Second pass: build parent-child relationships
        brands.forEach(brand => {
          const brandNode = brandMap.get(brand.brand_id);
          if (brand.parent_brand_id) {
            const parent = brandMap.get(brand.parent_brand_id);
            if (parent) {
              parent.children.push(brandNode);
            } else {
              rootBrands.push(brandNode);
            }
          } else {
            rootBrands.push(brandNode);
          }
        });

        res.json({
          success: true,
          data: {
            brands: brands,
            hierarchy: rootBrands
          }
        });
      } finally {
        await session.close();
      }
    } catch (error: any) {
      logger.error('Error fetching brand hierarchy', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch brand hierarchy',
        details: error.message
      });
    }
  },

  /**
   * Get all products (optionally filtered by category and brand)
   */
  getProducts: async (req: Request, res: Response) => {
    try {
      const { categoryIds, brandIds } = req.query;
      
      // Parse category IDs (can be comma-separated)
      const selectedCategoryIds = categoryIds 
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];
      
      // Parse brand IDs (can be comma-separated)
      const selectedBrandIds = brandIds
        ? (Array.isArray(brandIds) ? brandIds : brandIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];

      // If categories/brands are selected, get all children from Neo4j
      let allCategoryIds: number[] = [];
      let allBrandIds: number[] = [];

      if (selectedCategoryIds.length > 0 || selectedBrandIds.length > 0) {
        const session = getSession();
        try {
          // Get all category children
          if (selectedCategoryIds.length > 0) {
            const categoryQuery = `
              MATCH (root:category_h)
              WHERE root.category_id IN [${selectedCategoryIds.join(',')}]
              OPTIONAL MATCH path = (root)<-[:Has_Parent_Cat*]-(child:category_h)
              WITH root, collect(DISTINCT child.category_id) as children
              RETURN root.category_id as root_id, children
              UNION
              MATCH (c:category_h)
              WHERE c.category_id IN [${selectedCategoryIds.join(',')}]
              RETURN c.category_id as root_id, [] as children
            `;
            const categoryResult = await session.run(categoryQuery);
            const categoryIdSet = new Set<number>();
            categoryResult.records.forEach(record => {
              const rootId = Number(record.get('root_id')) || 0;
              if (rootId) categoryIdSet.add(rootId);
              const children = record.get('children');
              if (children && Array.isArray(children)) {
                children.forEach((childId: any) => {
                  const id = Number(childId) || 0;
                  if (id) categoryIdSet.add(id);
                });
              }
            });
            allCategoryIds = Array.from(categoryIdSet);
          }

          // Get all brand children
          if (selectedBrandIds.length > 0) {
            const brandQuery = `
              MATCH (root:brand_h)
              WHERE root.brand_id IN [${selectedBrandIds.join(',')}]
              OPTIONAL MATCH path = (root)<-[:Has_Parent_Brand*]-(child:brand_h)
              WITH root, collect(DISTINCT child.brand_id) as children
              RETURN root.brand_id as root_id, children
              UNION
              MATCH (b:brand_h)
              WHERE b.brand_id IN [${selectedBrandIds.join(',')}]
              RETURN b.brand_id as root_id, [] as children
            `;
            const brandResult = await session.run(brandQuery);
            const brandIdSet = new Set<number>();
            brandResult.records.forEach(record => {
              const rootId = Number(record.get('root_id')) || 0;
              if (rootId) brandIdSet.add(rootId);
              const children = record.get('children');
              if (children && Array.isArray(children)) {
                children.forEach((childId: any) => {
                  const id = Number(childId) || 0;
                  if (id) brandIdSet.add(id);
                });
              }
            });
            allBrandIds = Array.from(brandIdSet);
          }
        } finally {
          await session.close();
        }
      }

      try {
        await pcDbPool.query('SELECT 1');
        
        let query = `SELECT product_id, sku_name, barcode, category_id, brand_id FROM product_m WHERE 1=1`;
        const queryParams: any[] = [];
        let paramIndex = 1;

        if (allCategoryIds.length > 0) {
          query += ` AND category_id = ANY($${paramIndex})`;
          queryParams.push(allCategoryIds);
          paramIndex++;
        }

        if (allBrandIds.length > 0) {
          query += ` AND brand_id = ANY($${paramIndex})`;
          queryParams.push(allBrandIds);
          paramIndex++;
        }

        query += ` ORDER BY product_id`;

        const result = await pcDbPool.query(query, queryParams);
        res.json({ success: true, data: result.rows });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          // Use Docker exec fallback
          let query = `SELECT product_id, sku_name, barcode, category_id, brand_id FROM product_m WHERE 1=1`;
          
          if (allCategoryIds.length > 0) {
            query += ` AND category_id IN (${allCategoryIds.join(',')})`;
          }

          if (allBrandIds.length > 0) {
            query += ` AND brand_id IN (${allBrandIds.join(',')})`;
          }

          query += ` ORDER BY product_id;`;

          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );
          
          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
          const products = lines.map(line => {
            const [product_id, sku_name, barcode, category_id, brand_id] = line.split('|');
            return {
              product_id: parseInt(product_id) || 0,
              sku_name: sku_name || '',
              barcode: barcode || null,
              category_id: category_id ? parseInt(category_id) : null,
              brand_id: brand_id ? parseInt(brand_id) : null
            };
          });
          
          res.json({ success: true, data: products });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching products', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch products',
        details: error.message
      });
    }
  },

  /**
   * Get prices report with customer hierarchy and product filters
   */
  getPricesReport: async (req: Request, res: Response) => {
    try {
      const { customerIds, productIds, timeIds } = req.query;
      
      // Parse customer IDs (can be comma-separated)
      const selectedCustomerIds = customerIds 
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];
      
      // Parse product IDs (can be comma-separated)
      const selectedProductIds = productIds
        ? (Array.isArray(productIds) ? productIds : productIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];

      // Parse time IDs (can be comma-separated)
      const selectedTimeIds = timeIds
        ? (Array.isArray(timeIds) ? timeIds : timeIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];

      const session = getSession();
      let allCustomerIds: number[] = [];
      let shouldFilterByCustomers = false;

      try {
        // If customer IDs are selected, get all children in hierarchy
        if (selectedCustomerIds.length > 0) {
          shouldFilterByCustomers = true;
          // Get all descendants of selected customers
          // Relationship is (child)-[:Has_Parent_Cust]->(parent)
          // So to get all children of a parent, we traverse backwards: (parent)<-[:Has_Parent_Cust*]-(child)
          const customerQuery = `
            MATCH (root:customer_h)
            WHERE root.customer_id IN [${selectedCustomerIds.join(',')}]
            OPTIONAL MATCH path = (root)<-[:Has_Parent_Cust*]-(child:customer_h)
            WITH root, collect(DISTINCT child.customer_id) as children
            RETURN root.customer_id as root_id, children
            UNION
            MATCH (c:customer_h)
            WHERE c.customer_id IN [${selectedCustomerIds.join(',')}]
            RETURN c.customer_id as root_id, [] as children
          `;

          const customerResult = await session.run(customerQuery);
          
          const customerIdSet = new Set<number>();
          customerResult.records.forEach(record => {
            const rootId = Number(record.get('root_id')) || 0;
            if (rootId) customerIdSet.add(rootId);
            
            const children = record.get('children');
            if (children && Array.isArray(children)) {
              children.forEach((childId: any) => {
                const id = Number(childId) || 0;
                if (id) customerIdSet.add(id);
              });
            }
          });
          
          allCustomerIds = Array.from(customerIdSet);
          logger.info('Customer hierarchy resolved for prices', { 
            selectedCount: selectedCustomerIds.length, 
            totalCustomerIds: allCustomerIds.length 
          });
        }
      } finally {
        await session.close();
      }

      // Build SQL query for prices
      let priceQuery = `
        SELECT 
          fp.price_id,
          fp.product_id,
          p.sku_name,
          p.barcode,
          fp.customer_id,
          c.customer_name,
          fp.time_id,
          t.date,
          fp.list_price,
          fp.customer_price,
          fp.base_price,
          fp.promo_price
        FROM fact_prices fp
        INNER JOIN product_m p ON fp.product_id = p.product_id
        INNER JOIN customer_h c ON fp.customer_id = c.customer_id
        INNER JOIN time_m t ON fp.time_id = t.time_id
        WHERE 1=1
      `;

      const queryParams: any[] = [];
      let paramIndex = 1;

      // Only add customer filter if customers were explicitly selected
      if (shouldFilterByCustomers && allCustomerIds.length > 0) {
        priceQuery += ` AND fp.customer_id = ANY($${paramIndex})`;
        queryParams.push(allCustomerIds);
        paramIndex++;
      }

      if (selectedProductIds.length > 0) {
        priceQuery += ` AND fp.product_id = ANY($${paramIndex})`;
        queryParams.push(selectedProductIds);
        paramIndex++;
      }

      if (selectedTimeIds.length > 0) {
        priceQuery += ` AND fp.time_id = ANY($${paramIndex})`;
        queryParams.push(selectedTimeIds);
        paramIndex++;
      }

      priceQuery += ` ORDER BY fp.product_id, fp.customer_id, t.date`;

      logger.info('Executing prices query', { 
        allCustomerIds: allCustomerIds.length, 
        selectedProductIds: selectedProductIds.length,
        selectedTimeIds: selectedTimeIds.length,
        query: priceQuery.substring(0, 200) 
      });

      const startTime = Date.now();

      try {
        await pcDbPool.query('SELECT 1');
        const result = await pcDbPool.query(priceQuery, queryParams);
        
        const executionTime = Date.now() - startTime;
        
        logger.info('Prices query successful', { rowCount: result.rows.length, executionTime });
        
        res.json({
          success: true,
          data: {
            prices: result.rows,
            totalRecords: result.rows.length,
            customerCount: new Set(result.rows.map((r: any) => r.customer_id)).size,
            productCount: new Set(result.rows.map((r: any) => r.product_id)).size,
            executionTimeMs: executionTime
          }
        });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.message?.includes('does not exist')) {
          // Use Docker exec fallback - build query without parameters
          let dockerQuery = `
            SELECT 
              fp.price_id,
              fp.product_id,
              p.sku_name,
              p.barcode,
              fp.customer_id,
              c.customer_name,
              fp.time_id,
              t.date,
              fp.list_price,
              fp.customer_price,
              fp.base_price,
              fp.promo_price
            FROM fact_prices fp
            INNER JOIN product_m p ON fp.product_id = p.product_id
            INNER JOIN customer_h c ON fp.customer_id = c.customer_id
            INNER JOIN time_m t ON fp.time_id = t.time_id
            WHERE 1=1
          `;

          // Only add customer filter if customers were explicitly selected
          if (shouldFilterByCustomers && allCustomerIds.length > 0) {
            dockerQuery += ` AND fp.customer_id IN (${allCustomerIds.join(',')})`;
          }

          if (selectedProductIds.length > 0) {
            dockerQuery += ` AND fp.product_id IN (${selectedProductIds.join(',')})`;
          }

          if (selectedTimeIds.length > 0) {
            dockerQuery += ` AND fp.time_id IN (${selectedTimeIds.join(',')})`;
          }

          dockerQuery += ` ORDER BY fp.product_id, fp.customer_id, t.date;`;

          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${dockerQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );

          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
          const prices = lines.map(line => {
            const [price_id, product_id, sku_name, barcode, customer_id, customer_name, time_id, date, list_price, customer_price, base_price, promo_price] = line.split('|');
            return {
              price_id: parseInt(price_id) || 0,
              product_id: parseInt(product_id) || 0,
              sku_name: sku_name || '',
              barcode: barcode || null,
              customer_id: parseInt(customer_id) || 0,
              customer_name: customer_name || '',
              time_id: parseInt(time_id) || 0,
              date: date || null,
              list_price: list_price ? parseFloat(list_price) : null,
              customer_price: customer_price ? parseFloat(customer_price) : null,
              base_price: base_price ? parseFloat(base_price) : null,
              promo_price: promo_price ? parseFloat(promo_price) : null
            };
          });

          const executionTime = Date.now() - startTime;
          logger.info('Prices query successful (Docker exec)', { rowCount: prices.length, executionTime });

          res.json({
            success: true,
            data: {
              prices: prices,
              totalRecords: prices.length,
              customerCount: new Set(prices.map(p => p.customer_id)).size,
              productCount: new Set(prices.map(p => p.product_id)).size,
              executionTimeMs: executionTime
            }
          });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching prices report', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch prices report',
        details: error.message
      });
    }
  },

  /**
   * Get time hierarchy (Year > Quarter > Month > Week > Day)
   */
  getTimeHierarchy: async (req: Request, res: Response) => {
    try {
      let query = `
        SELECT DISTINCT 
          year,
          quarter,
          month,
          week,
          time_id,
          date
        FROM time_m
        ORDER BY year DESC, quarter DESC, month DESC, week DESC, date DESC
      `;

      try {
        await pcDbPool.query('SELECT 1');
        const result = await pcDbPool.query(query);
        
        // Build hierarchy structure
        const hierarchy: any = {};
        const flatData: any[] = [];

        result.rows.forEach((row: any) => {
          const year = row.year;
          const quarter = row.quarter;
          const month = row.month;
          const week = row.week;
          const timeId = row.time_id;
          const date = row.date;

          // Initialize year if not exists
          if (!hierarchy[year]) {
            hierarchy[year] = {
              year,
              quarters: {}
            };
          }

          // Initialize quarter if not exists
          const quarterKey = `Q${quarter}`;
          if (!hierarchy[year].quarters[quarterKey]) {
            hierarchy[year].quarters[quarterKey] = {
              year,
              quarter,
              months: {}
            };
          }

          // Initialize month if not exists
          const monthKey = month.toString().padStart(2, '0');
          if (!hierarchy[year].quarters[quarterKey].months[monthKey]) {
            hierarchy[year].quarters[quarterKey].months[monthKey] = {
              year,
              quarter,
              month,
              weeks: {}
            };
          }

          // Initialize week if not exists
          const weekKey = week.toString().padStart(2, '0');
          if (!hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey]) {
            hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey] = {
              year,
              quarter,
              month,
              week,
              days: []
            };
          }

          // Add day
          hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey].days.push({
            time_id: timeId,
            date: date,
            day: new Date(date).getDate()
          });

          // Also keep flat data for easy access
          flatData.push({
            time_id: timeId,
            date: date,
            year,
            quarter,
            month,
            week,
            day: new Date(date).getDate()
          });
        });

        // Convert to array format
        const hierarchyArray = Object.values(hierarchy).map((yearData: any) => ({
          year: yearData.year,
          quarters: Object.values(yearData.quarters).map((quarterData: any) => ({
            year: quarterData.year,
            quarter: quarterData.quarter,
            months: Object.values(quarterData.months).map((monthData: any) => ({
              year: monthData.year,
              quarter: monthData.quarter,
              month: monthData.month,
              weeks: Object.values(monthData.weeks).map((weekData: any) => ({
                year: weekData.year,
                quarter: weekData.quarter,
                month: weekData.month,
                week: weekData.week,
                days: weekData.days
              }))
            }))
          }))
        }));

        res.json({
          success: true,
          data: {
            hierarchy: hierarchyArray,
            flatData: flatData
          }
        });
        return;
      } catch (directError: any) {
        if (directError.code === '28000' || directError.code === '3D000' || directError.message?.includes('does not exist') || directError.message?.includes('role')) {
          // Use Docker exec fallback
          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${query.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );

          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('('));
          const flatData = lines.map(line => {
            const [year, quarter, month, week, time_id, date] = line.split('|');
            return {
              time_id: parseInt(time_id) || 0,
              date: date || null,
              year: parseInt(year) || 0,
              quarter: parseInt(quarter) || 0,
              month: parseInt(month) || 0,
              week: parseInt(week) || 0,
              day: date ? new Date(date).getDate() : 0
            };
          });

          // Build hierarchy from flat data
          const hierarchy: any = {};
          flatData.forEach((row: any) => {
            const { year, quarter, month, week, time_id, date } = row;

            if (!hierarchy[year]) {
              hierarchy[year] = { year, quarters: {} };
            }

            const quarterKey = `Q${quarter}`;
            if (!hierarchy[year].quarters[quarterKey]) {
              hierarchy[year].quarters[quarterKey] = { year, quarter, months: {} };
            }

            const monthKey = month.toString().padStart(2, '0');
            if (!hierarchy[year].quarters[quarterKey].months[monthKey]) {
              hierarchy[year].quarters[quarterKey].months[monthKey] = { year, quarter, month, weeks: {} };
            }

            const weekKey = week.toString().padStart(2, '0');
            if (!hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey]) {
              hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey] = { year, quarter, month, week, days: [] };
            }

            hierarchy[year].quarters[quarterKey].months[monthKey].weeks[weekKey].days.push({
              time_id,
              date,
              day: new Date(date).getDate()
            });
          });

          const hierarchyArray = Object.values(hierarchy).map((yearData: any) => ({
            year: yearData.year,
            quarters: Object.values(yearData.quarters).map((quarterData: any) => ({
              year: quarterData.year,
              quarter: quarterData.quarter,
              months: Object.values(quarterData.months).map((monthData: any) => ({
                year: monthData.year,
                quarter: monthData.quarter,
                month: monthData.month,
                weeks: Object.values(monthData.weeks).map((weekData: any) => ({
                  year: weekData.year,
                  quarter: weekData.quarter,
                  month: weekData.month,
                  week: weekData.week,
                  days: weekData.days
                }))
              }))
            }))
          }));

          res.json({
            success: true,
            data: {
              hierarchy: hierarchyArray,
              flatData: flatData
            }
          });
          return;
        }
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching time hierarchy', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch time hierarchy',
        details: error.message
      });
    }
  },

  /**
   * Get costs report with customer hierarchy and product filters
   */
  getCostsReport: async (req: Request, res: Response) => {
    try {
      const { customerIds, productIds, timeIds } = req.query;
      
      // Parse customer IDs (can be comma-separated)
      const selectedCustomerIds = customerIds 
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];
      
      // Parse product IDs (can be comma-separated)
      const selectedProductIds = productIds
        ? (Array.isArray(productIds) ? productIds : productIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];

      // Parse time IDs (can be comma-separated)
      const selectedTimeIds = timeIds
        ? (Array.isArray(timeIds) ? timeIds : timeIds.toString().split(',')).map(id => parseInt(id.toString()))
        : [];

      const session = getSession();
      let allCustomerIds: number[] = [];
      let shouldFilterByCustomers = false;

      try {
        // If customer IDs are selected, get all children in hierarchy
        if (selectedCustomerIds.length > 0) {
          shouldFilterByCustomers = true;
          // Get all descendants of selected customers
          // Relationship is (child)-[:Has_Parent_Cust]->(parent)
          // So to get all children of a parent, we traverse backwards: (parent)<-[:Has_Parent_Cust*]-(child)
          const customerQuery = `
            MATCH (root:customer_h)
            WHERE root.customer_id IN [${selectedCustomerIds.join(',')}]
            OPTIONAL MATCH path = (root)<-[:Has_Parent_Cust*]-(child:customer_h)
            WITH root, collect(DISTINCT child.customer_id) as children
            RETURN root.customer_id as root_id, children
            UNION
            MATCH (c:customer_h)
            WHERE c.customer_id IN [${selectedCustomerIds.join(',')}]
            RETURN c.customer_id as root_id, [] as children
          `;

          const customerResult = await session.run(customerQuery);
          
          const customerIdSet = new Set<number>();
          customerResult.records.forEach(record => {
            const rootId = Number(record.get('root_id')) || 0;
            if (rootId) customerIdSet.add(rootId);
            
            const children = record.get('children');
            if (children && Array.isArray(children)) {
              children.forEach((childId: any) => {
                const id = Number(childId) || 0;
                if (id) customerIdSet.add(id);
              });
            }
          });
          
          allCustomerIds = Array.from(customerIdSet);
          logger.info('Customer hierarchy resolved for costs', { 
            selectedCount: selectedCustomerIds.length, 
            totalCustomerIds: allCustomerIds.length 
          });
        }
      } finally {
        await session.close();
      }

      // Build SQL query for costs
      let costQuery = `
        SELECT 
          fc.cost_id,
          fc.product_id,
          p.sku_name,
          p.barcode,
          fc.customer_id,
          c.customer_name,
          fc.time_id,
          t.date,
          fc.cogs,
          fc.logs
        FROM fact_costs fc
        INNER JOIN product_m p ON fc.product_id = p.product_id
        INNER JOIN customer_h c ON fc.customer_id = c.customer_id
        INNER JOIN time_m t ON fc.time_id = t.time_id
        WHERE 1=1
      `;

      const queryParams: any[] = [];
      let paramIndex = 1;

      // Only add customer filter if customers were explicitly selected
      if (shouldFilterByCustomers && allCustomerIds.length > 0) {
        costQuery += ` AND fc.customer_id = ANY($${paramIndex})`;
        queryParams.push(allCustomerIds);
        paramIndex++;
      }

      if (selectedProductIds.length > 0) {
        costQuery += ` AND fc.product_id = ANY($${paramIndex})`;
        queryParams.push(selectedProductIds);
        paramIndex++;
      }

      if (selectedTimeIds.length > 0) {
        costQuery += ` AND fc.time_id = ANY($${paramIndex})`;
        queryParams.push(selectedTimeIds);
        paramIndex++;
      }

      costQuery += ` ORDER BY fc.product_id, fc.customer_id, t.date`;

      logger.info('Executing costs query', { 
        allCustomerIds: allCustomerIds.length, 
        selectedProductIds: selectedProductIds.length,
        selectedTimeIds: selectedTimeIds.length,
        query: costQuery.substring(0, 200) 
      });

      const startTime = Date.now();

      try {
        await pcDbPool.query('SELECT 1');
        const result = await pcDbPool.query(costQuery, queryParams);
        
        const executionTime = Date.now() - startTime;
        
        logger.info('Costs query successful', { rowCount: result.rows.length, executionTime });
        
        res.json({
          success: true,
          data: {
            costs: result.rows,
            totalRecords: result.rows.length,
            customerCount: new Set(result.rows.map((r: any) => r.customer_id)).size,
            productCount: new Set(result.rows.map((r: any) => r.product_id)).size,
            executionTimeMs: executionTime
          }
        });
        return;
      } catch (directError: any) {
        logger.warn('Direct PostgreSQL connection failed, trying Docker exec fallback', {
          error: directError.message,
          code: directError.code
        });
        
        if (directError.code === '28000' || directError.code === '3D000' || directError.message?.includes('does not exist') || directError.message?.includes('role')) {
          logger.warn('Direct PostgreSQL connection failed, trying Docker exec fallback', {
            error: directError.message,
            code: directError.code
          });
          
          // Use Docker exec fallback - build query without parameters
          let dockerQuery = `
            SELECT 
              fc.cost_id,
              fc.product_id,
              p.sku_name,
              p.barcode,
              fc.customer_id,
              c.customer_name,
              fc.time_id,
              t.date,
              fc.cogs,
              fc.logs
            FROM fact_costs fc
            INNER JOIN product_m p ON fc.product_id = p.product_id
            INNER JOIN customer_h c ON fc.customer_id = c.customer_id
            INNER JOIN time_m t ON fc.time_id = t.time_id
            WHERE 1=1
          `;

          // Only add customer filter if customers were explicitly selected
          if (shouldFilterByCustomers && allCustomerIds.length > 0) {
            dockerQuery += ` AND fc.customer_id IN (${allCustomerIds.join(',')})`;
          }

          if (selectedProductIds.length > 0) {
            dockerQuery += ` AND fc.product_id IN (${selectedProductIds.join(',')})`;
          }

          if (selectedTimeIds.length > 0) {
            dockerQuery += ` AND fc.time_id IN (${selectedTimeIds.join(',')})`;
          }

          dockerQuery += ` ORDER BY fc.product_id, fc.customer_id, t.date;`;

          const { stdout } = await execAsync(
            `docker exec planning_console_postgres psql -U postgres -d pc_postgres_db -t -A -F'|' -c "${dockerQuery.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
          );

          const lines = stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('(') && !l.includes('rows)'));
          logger.info('Docker exec query result', { lineCount: lines.length, sample: lines[0] });
          
          const costs = lines.map(line => {
            const [cost_id, product_id, sku_name, barcode, customer_id, customer_name, time_id, date, cogs, logs] = line.split('|');
            return {
              cost_id: parseInt(cost_id) || 0,
              product_id: parseInt(product_id) || 0,
              sku_name: sku_name || '',
              barcode: barcode || null,
              customer_id: parseInt(customer_id) || 0,
              customer_name: customer_name || '',
              time_id: parseInt(time_id) || 0,
              date: date || null,
              cogs: cogs ? parseFloat(cogs) : null,
              logs: logs ? parseFloat(logs) : null
            };
          });

          const executionTime = Date.now() - startTime;
          logger.info('Costs parsed from Docker exec', { costCount: costs.length, executionTime });

          res.json({
            success: true,
            data: {
              costs: costs,
              totalRecords: costs.length,
              customerCount: new Set(costs.map(c => c.customer_id)).size,
              productCount: new Set(costs.map(c => c.product_id)).size,
              executionTimeMs: executionTime
            }
          });
          return;
        }
        logger.error('Costs query failed with unhandled error', directError);
        throw directError;
      }
    } catch (error: any) {
      logger.error('Error fetching costs report', {
        error: error.message,
        code: error.code,
        stack: error.stack
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch costs report',
        details: error.message,
        code: error.code
      });
    }
  }
};

