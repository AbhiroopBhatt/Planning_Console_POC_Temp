import { Request, Response } from 'express';
import { query } from '../db/postgres';
import { logger } from '../utils/logger';
import { mlService } from '../services/mlService';
import { query as duckdbQuery, isAvailable } from '../db/duckdb';
import { Pool } from 'pg';
import dotenv from 'dotenv';

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

const pcDbPool = getPcDbPool();

/**
 * Expand parent IDs to include all children using DuckDB rollup views
 * Returns all child_ids (including self) for the given parent_ids
 */
async function expandHierarchicalIds(
  parentIds: number[],
  rollupViewName: 'customer_rollup' | 'category_rollup' | 'brand_rollup' | 'region_rollup'
): Promise<number[]> {
  if (parentIds.length === 0) {
    return [];
  }

  if (!isAvailable()) {
    // If DuckDB is not available, return the original IDs (no expansion)
    logger.warn(`DuckDB not available, cannot expand ${rollupViewName}`);
    return parentIds;
  }

  try {
    // Use a recursive approach: start with parent IDs and iteratively find all descendants
    // This ensures we capture ALL transitive relationships, not just what's in the rollup view
    let currentLevelIds = [...parentIds];
    const allDescendantIds = new Set<number>(parentIds);
    const maxIterations = 20; // Safety limit
    let iteration = 0;

    // Iteratively expand: for each current level, find all children, then use those children as the next level
    while (currentLevelIds.length > 0 && iteration < maxIterations) {
      const idsString = currentLevelIds.join(',');
      const query = `
        SELECT DISTINCT child_id
        FROM ${rollupViewName}
        WHERE parent_id IN (${idsString})
          AND child_id != parent_id  -- Exclude self-references to avoid infinite loops
      `;
      
      const result = await duckdbQuery(query);
      const childIds = result.map((row: any) => {
        const id = row.child_id;
        return typeof id === 'string' ? parseInt(id) : id;
      }).filter(id => !isNaN(id) && !allDescendantIds.has(id)); // Only get new IDs
      
      if (childIds.length === 0) {
        // No more children found, we've reached the leaf nodes
        break;
      }
      
      // Add new children to the set
      childIds.forEach(id => allDescendantIds.add(id));
      
      // Use the children as the next level to expand
      currentLevelIds = childIds;
      iteration++;
      
      logger.debug(`Iteration ${iteration}: Found ${childIds.length} new children for ${rollupViewName} [${idsString}], total descendants: ${allDescendantIds.size}`);
    }
    
    const allIds = Array.from(allDescendantIds).sort((a, b) => a - b);
    
    logger.info(`Expanded ${parentIds.length} ${rollupViewName} parent IDs [${parentIds.join(',')}] to ${allIds.length} total IDs [${allIds.slice(0, 20).join(',')}${allIds.length > 20 ? `... (+${allIds.length - 20} more)` : ''}] in ${iteration} iterations`);
    
    if (allIds.length === parentIds.length) {
      logger.warn(`No children found for ${rollupViewName} parent IDs [${parentIds.join(',')}]. The rollup view may need to be refreshed by rebuilding the graph.`);
    }
    
    return allIds;
  } catch (error: any) {
    logger.error(`Error expanding ${rollupViewName} IDs for parent IDs [${parentIds.join(',')}]`, error);
    // Fallback to original IDs if expansion fails
    return parentIds;
  }
}

export const promotionsController = {
  getAll: async (req: Request, res: Response) => {
    try {
      const { 
        categoryIds, 
        brandIds, 
        regionIds, 
        channelIds, 
        customerIds, 
        startDate, 
        endDate 
      } = req.query;

      // Parse filter parameters
      const selectedCategoryIds = categoryIds 
        ? (Array.isArray(categoryIds) ? categoryIds : categoryIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      const selectedBrandIds = brandIds
        ? (Array.isArray(brandIds) ? brandIds : brandIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      const selectedRegionIds = regionIds
        ? (Array.isArray(regionIds) ? regionIds : regionIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      const selectedChannelIds = channelIds
        ? (Array.isArray(channelIds) ? channelIds : channelIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];
      const selectedCustomerIds = customerIds
        ? (Array.isArray(customerIds) ? customerIds : customerIds.toString().split(',')).map(id => parseInt(id.toString())).filter(id => !isNaN(id))
        : [];

      // Expand hierarchical IDs using DuckDB rollup views
      const expandedCategoryIds = selectedCategoryIds.length > 0 
        ? await expandHierarchicalIds(selectedCategoryIds, 'category_rollup')
        : [];
      const expandedBrandIds = selectedBrandIds.length > 0
        ? await expandHierarchicalIds(selectedBrandIds, 'brand_rollup')
        : [];
      const expandedRegionIds = selectedRegionIds.length > 0
        ? await expandHierarchicalIds(selectedRegionIds, 'region_rollup')
        : [];
      const expandedCustomerIds = selectedCustomerIds.length > 0
        ? await expandHierarchicalIds(selectedCustomerIds, 'customer_rollup')
        : [];

      // Build filter conditions
      const filterConditions: string[] = []
      const filterParams: any[] = []
      let paramIndex = 1

      if (expandedCategoryIds.length > 0) {
        filterConditions.push(`fp.product_id IN (SELECT product_id FROM Product_M WHERE category_id = ANY($${paramIndex}))`)
        filterParams.push(expandedCategoryIds)
        paramIndex++
      }

      if (expandedBrandIds.length > 0) {
        filterConditions.push(`fp.product_id IN (SELECT product_id FROM Product_M WHERE brand_id = ANY($${paramIndex}))`)
        filterParams.push(expandedBrandIds)
        paramIndex++
      }

      if (expandedRegionIds.length > 0) {
        filterConditions.push(`fp.region_id = ANY($${paramIndex})`)
        filterParams.push(expandedRegionIds)
        paramIndex++
      }

      if (selectedChannelIds.length > 0) {
        filterConditions.push(`fp.channel_id = ANY($${paramIndex})`)
        filterParams.push(selectedChannelIds)
        paramIndex++
      }

      if (expandedCustomerIds.length > 0) {
        filterConditions.push(`fp.customer_id = ANY($${paramIndex})`)
        filterParams.push(expandedCustomerIds)
        paramIndex++
      }

      if (startDate) {
        const startTimeResult = await pcDbPool.query(`SELECT MIN(time_id) as time_id FROM time_m WHERE date >= $1`, [startDate])
        if (startTimeResult.rows[0]?.time_id) {
          filterConditions.push(`fp.time_id >= $${paramIndex}`)
          filterParams.push(startTimeResult.rows[0].time_id)
          paramIndex++
        }
      }

      if (endDate) {
        const endTimeResult = await pcDbPool.query(`SELECT MAX(time_id) as time_id FROM time_m WHERE date <= $1`, [endDate])
        if (endTimeResult.rows[0]?.time_id) {
          filterConditions.push(`fp.time_id <= $${paramIndex}`)
          filterParams.push(endTimeResult.rows[0].time_id)
          paramIndex++
        }
      }

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''

      // Get all promotion records (each record is independent)
      const result = await pcDbPool.query(`
        SELECT 
          fp.promo_id,
          fp.discount_pct,
          fp.time_id,
          fp.product_id,
          fp.customer_id,
          fp.region_id,
          fp.channel_id,
          COALESCE(
            (SELECT STRING_AGG(DISTINCT ch.customer_name, ', ' ORDER BY ch.customer_name)
             FROM customer_h ch
             WHERE ch.customer_id = fp.customer_id),
            ''
          ) as customer_names,
          COALESCE(fp.base_volume_snapshot, 0) as total_base_volume,
          COALESCE(fp.promo_volume_estimate, 0) as total_promo_volume,
          COALESCE(fp.incremental_volume, 0) as total_incremental_volume,
          COALESCE(fp.incremental_revenue, 0) as total_incremental_revenue,
          COALESCE(fp.incremental_margin, 0) as total_incremental_margin
        FROM fact_promotions fp
        ${whereClause}
        ORDER BY fp.promo_id DESC
      `, filterParams);

      // Get date ranges for each promotion record
      const promotions = await Promise.all(
        result.rows.map(async (row) => {
          const dateResult = await pcDbPool.query(`
            SELECT date
            FROM time_m
            WHERE time_id = $1
          `, [row.time_id]);

          return {
            promo_id: row.promo_id,
            discount_pct: parseFloat(row.discount_pct),
            start_date: dateResult.rows[0]?.date || null,
            end_date: dateResult.rows[0]?.date || null,
            product_count: 1,
            customer_count: parseInt(row.customer_count),
            region_count: parseInt(row.region_count),
            channel_count: parseInt(row.channel_count),
            total_base_volume: parseFloat(row.total_base_volume) || 0,
            total_promo_volume: parseFloat(row.total_promo_volume) || 0,
            total_incremental_volume: parseFloat(row.total_incremental_volume) || 0,
            total_incremental_revenue: parseFloat(row.total_incremental_revenue) || 0,
            total_incremental_margin: parseFloat(row.total_incremental_margin) || 0,
            customer_names: row.customer_names || '',
            status: 'draft' // Default status
          };
        })
      );

      // Calculate overall statistics
      const stats = {
        total_promotions: promotions.length,
        total_records: promotions.reduce((sum, p) => sum + p.record_count, 0),
        total_base_volume: promotions.reduce((sum, p) => sum + p.total_base_volume, 0),
        total_promo_volume: promotions.reduce((sum, p) => sum + p.total_promo_volume, 0),
        total_incremental_volume: promotions.reduce((sum, p) => sum + p.total_incremental_volume, 0),
        total_incremental_revenue: promotions.reduce((sum, p) => sum + p.total_incremental_revenue, 0),
        total_incremental_margin: promotions.reduce((sum, p) => sum + p.total_incremental_margin, 0),
        avg_discount: promotions.length > 0 
          ? promotions.reduce((sum, p) => sum + p.discount_pct, 0) / promotions.length 
          : 0
      }

      res.json({ 
        success: true, 
        data: {
          promotions,
          statistics: stats
        }
      });
    } catch (error: any) {
      logger.error('Error fetching promotions', error);
      res.status(500).json({ success: false, error: 'Failed to fetch promotions', details: error.message });
    }
  },

  getFactPromotionById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promoId = parseInt(id);

      // Get the promotion record by promo_id
      const result = await pcDbPool.query(`
        SELECT 
          fp.*,
          p.sku_name,
          p.barcode,
          c.customer_name,
          r.region_name,
          ch.channel_name,
          t.date
        FROM fact_promotions fp
        LEFT JOIN product_m p ON fp.product_id = p.product_id
        LEFT JOIN customer_h c ON fp.customer_id = c.customer_id
        LEFT JOIN region_h r ON fp.region_id = r.region_id
        LEFT JOIN channel_m ch ON fp.channel_id = ch.channel_id
        LEFT JOIN time_m t ON fp.time_id = t.time_id
        WHERE fp.promo_id = $1
      `, [promoId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }

      const record = result.rows[0];
      const dateResult = await pcDbPool.query(`
        SELECT date
        FROM time_m
        WHERE time_id = $1
      `, [record.time_id]);

      res.json({
        success: true,
        data: {
          summary: {
            promo_id: record.promo_id,
            discount_pct: parseFloat(record.discount_pct || '0'),
            start_date: dateResult.rows[0]?.date || null,
            end_date: dateResult.rows[0]?.date || null,
            product_count: 1,
            customer_count: 1,
            region_count: 1,
            channel_count: 1
          },
          records: [record]
        }
      });
    } catch (error: any) {
      logger.error('Error fetching promotion', error);
      res.status(500).json({ success: false, error: 'Failed to fetch promotion', details: error.message });
    }
  },

  updateVolumes: async (req: Request, res: Response) => {
    try {
      const { records } = req.body; // Array of { promo_id, base_volume_snapshot, promo_volume_estimate }

      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'Records array is required' });
      }

      const client = await pcDbPool.connect();
      try {
        await client.query('BEGIN');

        for (const record of records) {
          const { promo_id, base_volume_snapshot, promo_volume_estimate } = record;

          // Get existing record to calculate incremental metrics
          const existingResult = await client.query(`
            SELECT 
              promo_price_calculated,
              cogs_snapshot,
              logs_snapshot,
              base_price_snapshot
            FROM fact_promotions
            WHERE promo_id = $1
          LIMIT 1
        `, [promo_id]);

          if (existingResult.rows.length === 0) {
            throw new Error(`Promotion record with promo_id ${promo_id} not found`);
          }

          const existing = existingResult.rows[0];
          const baseVolume = base_volume_snapshot !== null && base_volume_snapshot !== undefined 
            ? Number(base_volume_snapshot) 
            : null;
          const promoVolume = promo_volume_estimate !== null && promo_volume_estimate !== undefined 
            ? Number(promo_volume_estimate) 
            : null;

          // Calculate incremental metrics
          let incrementalVolume = null;
          let incrementalRevenue = null;
          let incrementalMargin = null;

          if (baseVolume !== null && promoVolume !== null) {
            incrementalVolume = promoVolume - baseVolume;

            const promoPrice = Number(existing.promo_price_calculated) || 0;
            const basePrice = Number(existing.base_price_snapshot) || 0;
            incrementalRevenue = (promoVolume * promoPrice) - (baseVolume * basePrice);

            const cogs = Number(existing.cogs_snapshot) || 0;
            const logs = Number(existing.logs_snapshot) || 0;
            const totalCost = cogs + logs;
            
            const marginAtPromo = promoVolume * (promoPrice - totalCost);
            const marginAtBase = baseVolume * (basePrice - totalCost);
            incrementalMargin = marginAtPromo - marginAtBase;
          }

          // Update the specific record by promo_id
          await client.query(`
            UPDATE fact_promotions
            SET 
              base_volume_snapshot = $1,
              promo_volume_estimate = $2,
              incremental_volume = $3,
              incremental_revenue = $4,
              incremental_margin = $5
            WHERE promo_id = $6
          `, [
            baseVolume,
            promoVolume,
            incrementalVolume,
            incrementalRevenue,
            incrementalMargin,
            promo_id
          ]);
        }

        await client.query('COMMIT');
        res.json({ success: true, message: `Updated ${records.length} promotion record(s)` });
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Error updating volumes', error);
      res.status(500).json({ success: false, error: 'Failed to update volumes', details: error.message });
    }
  },

  reestimateVolumes: async (req: Request, res: Response) => {
    try {
      logger.info(`Re-estimate volumes endpoint called for promo_id: ${req.params.id}`);
      const { id } = req.params;
      const promoId = parseInt(id);

      if (isNaN(promoId)) {
        return res.status(400).json({ success: false, error: 'Invalid promo_id' });
      }

      // Check if promotion exists
      const checkResult = await pcDbPool.query(`
        SELECT promo_id FROM fact_promotions WHERE promo_id = $1 LIMIT 1
      `, [promoId]);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }

      // Get active ML model
      const activeModel = await mlService.getActiveModel();
      if (!activeModel) {
        return res.status(400).json({ 
          success: false, 
          error: 'No active ML model found. Cannot re-estimate volumes.' 
        });
      }

      // Get the promotion record
      const recordsResult = await pcDbPool.query(`
        SELECT 
          fp.promo_id,
          fp.product_id,
          fp.customer_id,
          fp.base_volume_snapshot,
          fp.base_price_snapshot,
          fp.cogs_snapshot,
          fp.logs_snapshot,
          fp.promo_price_calculated,
          fp.discount_pct,
          p.category_id,
          p.brand_id
        FROM fact_promotions fp
        LEFT JOIN product_m p ON fp.product_id = p.product_id
        WHERE fp.promo_id = $1
      `, [promoId]);

      const records = recordsResult.rows;
      logger.info(`Re-estimating volumes for promotion ${promoId} (${records.length} records) using model ${activeModel.model_name} v${activeModel.model_version}`);

      const client = await pcDbPool.connect();
      try {
        await client.query('BEGIN');

        let updated = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const record of records) {
          try {
            // Skip records with null base volume
            if (record.base_volume_snapshot === null || record.base_volume_snapshot === undefined) {
              skipped++;
              continue;
            }

            // Estimate promo volume using ML model
            const volumeEstimate = await mlService.estimatePromoVolume({
              base_volume_snapshot: Number(record.base_volume_snapshot),
              product_id: record.product_id,
              customer_id: record.customer_id,
              category_id: record.category_id,
              brand_id: record.brand_id,
              discount_pct: Number(record.discount_pct)
            });

            const promoVolume = volumeEstimate.promo_volume_estimate;

            if (promoVolume === null) {
              skipped++;
              logger.warn(`ML estimation returned null for promo_id ${record.promo_id}`);
              continue;
            }

            // Calculate incremental metrics
            const baseVolume = Number(record.base_volume_snapshot);
            const incrementalVolume = promoVolume - baseVolume;

            let incrementalRevenue: number | null = null;
            let incrementalMargin: number | null = null;

            if (record.promo_price_calculated !== null && record.base_price_snapshot !== null) {
              const promoPrice = Number(record.promo_price_calculated);
              const basePrice = Number(record.base_price_snapshot);
              incrementalRevenue = (promoVolume * promoPrice) - (baseVolume * basePrice);

              if (record.cogs_snapshot !== null && record.logs_snapshot !== null) {
                const cogs = Number(record.cogs_snapshot);
                const logs = Number(record.logs_snapshot);
                const totalCost = cogs + logs;
                const marginAtPromo = promoVolume * (promoPrice - totalCost);
                const marginAtBase = baseVolume * (basePrice - totalCost);
                incrementalMargin = marginAtPromo - marginAtBase;
              }
            }

            // Update the record
            await client.query(`
              UPDATE fact_promotions
              SET 
                promo_volume_estimate = $1,
                incremental_volume = $2,
                incremental_revenue = $3,
                incremental_margin = $4
              WHERE promo_id = $5
            `, [promoVolume, incrementalVolume, incrementalRevenue, incrementalMargin, record.promo_id]);

            updated++;
          } catch (error: any) {
            failed++;
            const errorMsg = `Failed to re-estimate promo_id ${record.promo_id}: ${error.message}`;
            errors.push(errorMsg);
            logger.error(errorMsg, error);
          }
        }

        await client.query('COMMIT');

        logger.info(`Re-estimation complete for promotion ${promotionId}: ${updated} updated, ${skipped} skipped, ${failed} failed`);

        res.json({
          success: true,
          data: {
            promotion_id: promotionId,
            promo_id: promoId, // Keep for backward compatibility
            records_processed: records.length,
            records_updated: updated,
            records_skipped: skipped,
            records_failed: failed,
            model_used: `${activeModel.model_name} v${activeModel.model_version}`,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit errors in response
          },
          message: `Re-estimated ${updated} records using ${activeModel.model_name} v${activeModel.model_version}`
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Error re-estimating volumes', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to re-estimate volumes', 
        details: error.message 
      });
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const promotionResult = await query('SELECT * FROM promotions WHERE promotion_id = $1', [id]);
      
      if (promotionResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }
      
      const itemsResult = await query(
        `SELECT pi.*, pr.sku_name, c.customer_name, r.region_name, ch.channel_name
         FROM promotion_items pi
         LEFT JOIN products pr ON pi.product_id = pr.product_id
         LEFT JOIN customers c ON pi.customer_id = c.customer_id
         LEFT JOIN regions r ON pi.region_id = r.region_id
         LEFT JOIN channels ch ON pi.channel_id = ch.channel_id
         WHERE pi.promotion_id = $1`,
        [id]
      );
      
      res.json({
        success: true,
        data: {
          ...promotionResult.rows[0],
          items: itemsResult.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching promotion', error);
      res.status(500).json({ success: false, error: 'Failed to fetch promotion' });
    }
  },

  createFactPromotion: async (req: Request, res: Response) => {
    try {
      logger.info('=== createFactPromotion called ===');
      const { 
        productIds, 
        customerIds, 
        regionIds, 
        channelIds, 
        startDate, 
        endDate, 
        discountPct 
      } = req.body;
      logger.info(`Request params: products=${productIds}, customers=${customerIds}, dates=${startDate} to ${endDate}`);

      // Validate required fields
      if (!productIds || productIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one product must be selected' });
      }
      if (!customerIds || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one customer must be selected' });
      }
      if (!regionIds || regionIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one region must be selected' });
      }
      if (!channelIds || channelIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one channel must be selected' });
      }
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: 'Start date and end date are required' });
      }
      if (discountPct === undefined || discountPct === null) {
        return res.status(400).json({ success: false, error: 'Discount percentage is required' });
      }

      // Parse dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({ success: false, error: 'Start date must be before end date' });
      }

      // Get all time_ids for the date range
      const timeResult = await pcDbPool.query(
        `SELECT time_id, date FROM time_m WHERE date >= $1 AND date <= $2 ORDER BY date`,
        [startDate, endDate]
      );

      if (timeResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'No time records found for the selected date range' });
      }

      const timeIds = timeResult.rows.map(row => row.time_id);

      // Generate all combinations
      const combinations: any[] = [];
      for (const productId of productIds) {
        for (const customerId of customerIds) {
          for (const regionId of regionIds) {
            for (const channelId of channelIds) {
              for (const timeId of timeIds) {
                combinations.push({
                  product_id: productId,
                  customer_id: customerId,
                  region_id: regionId,
                  channel_id: channelId,
                  time_id: timeId
                });
              }
            }
          }
        }
      }

      logger.info(`Creating ${combinations.length} promotion records for date range ${startDate} to ${endDate}`);

      // Fetch product information (category_id, brand_id) for ML model
      const productInfoMap = new Map<number, { category_id: number | null, brand_id: number | null }>();
      const uniqueProductIds = [...new Set(combinations.map(c => c.product_id))];
      if (uniqueProductIds.length > 0) {
        const productResult = await pcDbPool.query(
          `SELECT product_id, category_id, brand_id FROM Product_M WHERE product_id = ANY($1)`,
          [uniqueProductIds]
        );
        productResult.rows.forEach(row => {
          productInfoMap.set(row.product_id, {
            category_id: row.category_id,
            brand_id: row.brand_id
          });
        });
      }

      // Fetch snapshots from DuckDB views for each unique product-customer-time combination
      const snapshotMap = new Map<string, any>();
      
      logger.info(`DuckDB available: ${isAvailable()}`);
      if (!isAvailable()) {
        logger.warn('DuckDB is not available, skipping snapshot fetching. All snapshots will be null.');
      } else {
        logger.info('DuckDB is available, fetching snapshots...');
        const uniqueCombos = new Set(
          combinations.map(c => `${c.product_id}-${c.customer_id}-${c.time_id}`)
        );

        logger.info(`Fetching snapshots for ${uniqueCombos.size} unique product-customer-time combinations`);

        for (const combo of uniqueCombos) {
          const [productId, customerId, timeId] = combo.split('-').map(Number);
          
          // Validate that all IDs are valid numbers
          if (isNaN(productId) || isNaN(customerId) || isNaN(timeId)) {
            logger.warn(`Invalid combo string: ${combo}, skipping...`);
            continue;
          }
          
          try {
            // Get base_price from Prices_allcombo_view
            // Note: DuckDB query doesn't support parameterized queries, so we use string interpolation
            // This is safe here as productId, customerId, and timeId are numbers from our own data
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            const priceResult = await duckdbQuery(
              `SELECT base_price, rollup_customer_id 
               FROM Prices_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            // Get cogs and logs from Costs_allcombo_view
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            const costResult = await duckdbQuery(
              `SELECT cogs, logs, rollup_customer_id 
               FROM Costs_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            // Get base_volume from Basevolume_allcombo_view
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            // IMPORTANT: Include time_id filter to get baseline volume per date
            const volumeResult = await duckdbQuery(
              `SELECT volume, rollup_customer_id, customer_id
               FROM Basevolume_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            const basePrice = priceResult.length > 0 ? Number(priceResult[0].base_price) : null;
            const cogs = costResult.length > 0 ? Number(costResult[0].cogs) : null;
            const logs = costResult.length > 0 ? Number(costResult[0].logs) : null;
            const baseVolume = volumeResult.length > 0 ? Number(volumeResult[0].volume) : null;

            snapshotMap.set(combo, {
              base_price_snapshot: basePrice,
              cogs_snapshot: cogs,
              logs_snapshot: logs,
              base_volume_snapshot: baseVolume
            });
          } catch (error: any) {
            logger.warn(`Failed to fetch snapshots for product ${productId}, customer ${customerId}, time ${timeId}: ${error.message}`, error);
            snapshotMap.set(combo, {
              base_price_snapshot: null,
              cogs_snapshot: null,
              logs_snapshot: null,
              base_volume_snapshot: null
            });
          }
        }
        logger.info(`Successfully fetched snapshots for ${snapshotMap.size} combinations`);
      }

      logger.info(`Preparing ${combinations.length} records for insertion...`);
      // Calculate promo_price and prepare records for insertion
      // Use async map to call ML service for volume estimation
      let records: any[];
      try {
        records = await Promise.all(combinations.map(async (combo) => {
        const snapshotKey = `${combo.product_id}-${combo.customer_id}-${combo.time_id}`;
        const snapshots = snapshotMap.get(snapshotKey) || {
          base_price_snapshot: null,
          cogs_snapshot: null,
          logs_snapshot: null,
          base_volume_snapshot: null
        };

        const basePrice = snapshots.base_price_snapshot;
        const promoPrice = basePrice !== null 
          ? basePrice * (1 - Number(discountPct) / 100)
          : null;

        // Get base_volume from snapshot (fetched from Basevolume_allcombo_view)
        const baseVolume = snapshots.base_volume_snapshot;
        const cogs = snapshots.cogs_snapshot;
        const logs = snapshots.logs_snapshot;

        // Get product info for ML model
        const productInfo = productInfoMap.get(combo.product_id) || { category_id: null, brand_id: null };

        // Estimate promo volume using ML model
        let promoVolume: number | null = null;
        try {
          logger.info(`Calling ML service for product ${combo.product_id}, customer ${combo.customer_id}, base_volume: ${baseVolume}, category: ${productInfo.category_id}, brand: ${productInfo.brand_id}, discount: ${discountPct}`);
          const volumeEstimate = await mlService.estimatePromoVolume({
            base_volume_snapshot: baseVolume,
            product_id: combo.product_id,
            customer_id: combo.customer_id,
            category_id: productInfo.category_id,
            brand_id: productInfo.brand_id,
            discount_pct: Number(discountPct)
          });
          promoVolume = volumeEstimate.promo_volume_estimate;
          logger.info(`ML estimation result for product ${combo.product_id}, customer ${combo.customer_id}: promo_volume = ${promoVolume}`);
        } catch (error: any) {
          logger.error(`Failed to estimate promo volume for product ${combo.product_id}, customer ${combo.customer_id}`, error);
          logger.error('Error details:', error.message, error.stack);
          // Continue with null promo volume if ML estimation fails
        }

        // Calculate incremental metrics if we have both base and promo volumes
        let incrementalVolume: number | null = null;
        let incrementalRevenue: number | null = null;
        let incrementalMargin: number | null = null;

        if (baseVolume !== null && promoVolume !== null) {
          incrementalVolume = promoVolume - baseVolume;

          if (promoPrice !== null && basePrice !== null) {
            incrementalRevenue = (promoVolume * promoPrice) - (baseVolume * basePrice);

            if (cogs !== null && logs !== null) {
              const totalCost = cogs + logs;
              const marginAtPromo = promoVolume * (promoPrice - totalCost);
              const marginAtBase = baseVolume * (basePrice - totalCost);
              incrementalMargin = marginAtPromo - marginAtBase;
            }
          }
        }

        return {
          product_id: combo.product_id,
          customer_id: combo.customer_id,
          region_id: combo.region_id,
          channel_id: combo.channel_id,
          time_id: combo.time_id,
          discount_pct: Number(discountPct),
          promo_price_calculated: promoPrice,
          cogs_snapshot: cogs,
          logs_snapshot: logs,
          base_price_snapshot: basePrice,
          base_volume_snapshot: baseVolume,
          promo_volume_estimate: promoVolume,
          incremental_volume: incrementalVolume,
          incremental_revenue: incrementalRevenue,
          incremental_margin: incrementalMargin
        };
        }));
        logger.info(`Prepared ${records.length} records successfully`);
      } catch (recordPrepError: any) {
        logger.error('Error preparing records:', recordPrepError.message);
        logger.error('Record prep error stack:', recordPrepError.stack);
        throw recordPrepError;
      }
      
      logger.info(`Starting database transaction...`);

      // Insert all records in a transaction
      const client = await pcDbPool.connect();
      try {
        logger.info('Starting transaction...');
        await client.query('BEGIN');
        logger.info('Transaction begun successfully');

        // Insert all records (each record is independent, identified by promo_id)
        const insertQuery = `
          INSERT INTO fact_promotions (
            product_id, customer_id, region_id, channel_id, time_id,
            discount_pct, promo_price_calculated,
            cogs_snapshot, logs_snapshot, base_price_snapshot,
            base_volume_snapshot, promo_volume_estimate,
            incremental_volume, incremental_revenue, incremental_margin
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          ) RETURNING promo_id
        `;

        const insertedIds: number[] = [];
        logger.info(`Inserting ${records.length} records`);
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          try {
            logger.debug(`Inserting record ${i + 1}/${records.length}: product=${record.product_id}, customer=${record.customer_id}, time=${record.time_id}`);
            const result = await client.query(insertQuery, [
              record.product_id,
              record.customer_id,
              record.region_id,
              record.channel_id,
              record.time_id,
              record.discount_pct,
              record.promo_price_calculated,
              record.cogs_snapshot,
              record.logs_snapshot,
              record.base_price_snapshot,
              record.base_volume_snapshot,
              record.promo_volume_estimate,
              record.incremental_volume,
              record.incremental_revenue,
              record.incremental_margin
            ]);
            insertedIds.push(result.rows[0].promo_id);
            if (i === 0) {
              logger.info(`First record inserted successfully, promo_id: ${result.rows[0].promo_id}`);
            }
          } catch (insertError: any) {
            logger.error(`Failed to insert record ${i + 1}:`, insertError.message);
            logger.error(`Error code:`, insertError.code);
            logger.error(`Error detail:`, insertError.detail);
            logger.error(`Error position:`, insertError.position);
            logger.error(`Record data:`, JSON.stringify(record, null, 2));
            logger.error(`Insert query being used:`, insertQuery);
            throw insertError;
          }
        }
        logger.info(`Successfully inserted ${insertedIds.length} records`);

        await client.query('COMMIT');

        const firstPromoId = insertedIds[0];
        const recordCount = insertedIds.length;

        logger.info(`Successfully created ${recordCount} promotion records, first promo_id: ${firstPromoId}`);

        res.json({
          success: true,
          data: {
            promo_id: firstPromoId,
            record_count: recordCount,
            message: `Promotion created successfully with ${recordCount} records`
          }
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        logger.error('=== TRANSACTION ERROR ===');
        logger.error('Error in transaction for createFactPromotion:', error);
        logger.error('Transaction error message:', error.message);
        logger.error('Transaction error code:', error.code);
        logger.error('Transaction error name:', error.name);
        if (error.detail) {
          logger.error('PostgreSQL transaction error detail:', error.detail);
        }
        if (error.position) {
          logger.error('Error position in query:', error.position);
        }
        if (error.where) {
          logger.error('Error location:', error.where);
        }
        if (error.hint) {
          logger.error('Error hint:', error.hint);
        }
        logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('=== OUTER CATCH ERROR ===');
      logger.error('Error creating promotion in createFactPromotion', error);
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
      logger.error('Error code:', error.code);
      if (error.detail) {
        logger.error('PostgreSQL error detail:', error.detail);
      }
      if (error.position) {
        logger.error('Error position:', error.position);
      }
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create promotion',
        details: error.message,
        code: error.code,
        detail: error.detail,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error.stack,
          position: error.position,
          hint: error.hint
        })
      });
    }
  },

  create: async (req: Request, res: Response) => {
    try {
      const { 
        productIds, 
        customerIds, 
        regionIds, 
        channelIds, 
        startDate, 
        endDate, 
        discountPct 
      } = req.body;

      // Validate required fields
      if (!productIds || productIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one product must be selected' });
      }
      if (!customerIds || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one customer must be selected' });
      }
      if (!regionIds || regionIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one region must be selected' });
      }
      if (!channelIds || channelIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one channel must be selected' });
      }
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: 'Start date and end date are required' });
      }
      if (discountPct === undefined || discountPct === null) {
        return res.status(400).json({ success: false, error: 'Discount percentage is required' });
      }

      // Parse dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return res.status(400).json({ success: false, error: 'Start date must be before end date' });
      }

      // Get all time_ids for the date range
      const timeResult = await pcDbPool.query(
        `SELECT time_id, date FROM time_m WHERE date >= $1 AND date <= $2 ORDER BY date`,
        [startDate, endDate]
      );

      if (timeResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'No time records found for the selected date range' });
      }

      const timeIds = timeResult.rows.map(row => row.time_id);

      // Generate all combinations
      const combinations: any[] = [];
      for (const productId of productIds) {
        for (const customerId of customerIds) {
          for (const regionId of regionIds) {
            for (const channelId of channelIds) {
              for (const timeId of timeIds) {
                combinations.push({
                  product_id: productId,
                  customer_id: customerId,
                  region_id: regionId,
                  channel_id: channelId,
                  time_id: timeId
                });
              }
            }
          }
        }
      }

      logger.info(`Creating ${combinations.length} promotion records`);

      // Fetch snapshots from DuckDB views for each unique product-customer-time combination
      const snapshotMap = new Map<string, any>();
      
      if (isAvailable()) {
        const uniqueCombos = new Set(
          combinations.map(c => `${c.product_id}-${c.customer_id}-${c.time_id}`)
        );

        for (const combo of uniqueCombos) {
          const [productId, customerId, timeId] = combo.split('-').map(Number);
          
          try {
            // Get base_price from Prices_allcombo_view
            // Note: DuckDB query doesn't support parameterized queries, so we use string interpolation
            // This is safe here as productId, customerId, and timeId are numbers from our own data
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            const priceResult = await duckdbQuery(
              `SELECT base_price, rollup_customer_id 
               FROM Prices_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            // Get cogs and logs from Costs_allcombo_view
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            const costResult = await duckdbQuery(
              `SELECT cogs, logs, rollup_customer_id 
               FROM Costs_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            // Get base_volume from Basevolume_allcombo_view
            // Check both customer_id (for parent/rollup data) and rollup_customer_id (for direct child data)
            // IMPORTANT: Include time_id filter to get baseline volume per date
            const volumeResult = await duckdbQuery(
              `SELECT volume, rollup_customer_id, customer_id
               FROM Basevolume_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            const basePrice = priceResult.length > 0 ? Number(priceResult[0].base_price) : null;
            const cogs = costResult.length > 0 ? Number(costResult[0].cogs) : null;
            const logs = costResult.length > 0 ? Number(costResult[0].logs) : null;
            const baseVolume = volumeResult.length > 0 ? Number(volumeResult[0].volume) : null;

            snapshotMap.set(combo, {
              base_price_snapshot: basePrice,
              cogs_snapshot: cogs,
              logs_snapshot: logs,
              base_volume_snapshot: baseVolume
            });
          } catch (error: any) {
            logger.warn(`Failed to fetch snapshots for product ${productId}, customer ${customerId}, time ${timeId}: ${error.message}`, error);
            snapshotMap.set(combo, {
              base_price_snapshot: null,
              cogs_snapshot: null,
              logs_snapshot: null,
              base_volume_snapshot: null
            });
          }
        }
      }

      // Calculate promo_price and prepare records for insertion
      const records = combinations.map(combo => {
        const snapshotKey = `${combo.product_id}-${combo.customer_id}-${combo.time_id}`;
        const snapshots = snapshotMap.get(snapshotKey) || {
          base_price_snapshot: null,
          cogs_snapshot: null,
          logs_snapshot: null,
          base_volume_snapshot: null
        };

        const basePrice = snapshots.base_price_snapshot;
        const promoPrice = basePrice !== null 
          ? basePrice * (1 - Number(discountPct) / 100)
          : null;

        // Get base_volume from snapshot (fetched from Basevolume_allcombo_view)
        const baseVolume = snapshots.base_volume_snapshot;
        const promoVolume = null; // User will input later
        const incrementalVolume = null; // Calculated when volumes are set
        const incrementalRevenue = null; // Calculated when volumes are set
        const incrementalMargin = null; // Calculated when volumes are set

        return {
          product_id: combo.product_id,
          customer_id: combo.customer_id,
          region_id: combo.region_id,
          channel_id: combo.channel_id,
          time_id: combo.time_id,
          discount_pct: Number(discountPct),
          promo_price_calculated: promoPrice,
          cogs_snapshot: snapshots.cogs_snapshot,
          logs_snapshot: snapshots.logs_snapshot,
          base_price_snapshot: basePrice,
          base_volume_snapshot: baseVolume,
          promo_volume_estimate: promoVolume,
          incremental_volume: incrementalVolume,
          incremental_revenue: incrementalRevenue,
          incremental_margin: incrementalMargin
        };
      });

      // Insert all records in a transaction
      const client = await pcDbPool.connect();
      try {
        await client.query('BEGIN');

        // Insert all records
        const insertQuery = `
          INSERT INTO Fact_Promotions (
            product_id, customer_id, region_id, channel_id, time_id,
            discount_pct, promo_price_calculated,
            cogs_snapshot, logs_snapshot, base_price_snapshot,
            base_volume_snapshot, promo_volume_estimate,
            incremental_volume, incremental_revenue, incremental_margin
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          ) RETURNING promo_id
        `;

        const insertedIds: number[] = [];
        for (const record of records) {
          const result = await client.query(insertQuery, [
            record.product_id,
            record.customer_id,
            record.region_id,
            record.channel_id,
            record.time_id,
            record.discount_pct,
            record.promo_price_calculated,
            record.cogs_snapshot,
            record.logs_snapshot,
            record.base_price_snapshot,
            record.base_volume_snapshot,
            record.promo_volume_estimate,
            record.incremental_volume,
            record.incremental_revenue,
            record.incremental_margin
          ]);
          insertedIds.push(result.rows[0].promo_id);
        }

        await client.query('COMMIT');

        // Get the first promo_id (all records in same promotion share the same promo_id range)
        const firstPromoId = insertedIds[0];
        const recordCount = insertedIds.length;

        logger.info(`Successfully created promotion with ${recordCount} records, first promo_id: ${firstPromoId}`);

        res.json({
          success: true,
          data: {
            promo_id: firstPromoId,
            record_count: recordCount,
            message: `Promotion created successfully with ${recordCount} records`
          }
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Error creating promotion', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to create promotion',
        details: error.message 
      });
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { promotion_name, description, start_date, end_date, status } = req.body;
      
      const result = await query(
        `UPDATE promotions
         SET promotion_name = $1, description = $2, start_date = $3, end_date = $4, status = $5, updated_at = CURRENT_TIMESTAMP
         WHERE promotion_id = $6
         RETURNING *`,
        [promotion_name, description, start_date, end_date, status, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error updating promotion', error);
      res.status(500).json({ success: false, error: 'Failed to update promotion' });
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query('DELETE FROM promotions WHERE promotion_id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting promotion', error);
      res.status(500).json({ success: false, error: 'Failed to delete promotion' });
    }
  },

  getItems: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await query(
        `SELECT pi.*, pr.sku_name, c.customer_name, r.region_name, ch.channel_name
         FROM promotion_items pi
         LEFT JOIN products pr ON pi.product_id = pr.product_id
         LEFT JOIN customers c ON pi.customer_id = c.customer_id
         LEFT JOIN regions r ON pi.region_id = r.region_id
         LEFT JOIN channels ch ON pi.channel_id = ch.channel_id
         WHERE pi.promotion_id = $1`,
        [id]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      logger.error('Error fetching promotion items', error);
      res.status(500).json({ success: false, error: 'Failed to fetch promotion items' });
    }
  },

  addItem: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { product_id, customer_id, region_id, channel_id, discount_type, discount_value, ml_model_id } = req.body;
      
      const result = await query(
        `INSERT INTO promotion_items (promotion_id, product_id, customer_id, region_id, channel_id, discount_type, discount_value, ml_model_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, product_id, customer_id, region_id, channel_id, discount_type, discount_value, ml_model_id]
      );
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error adding promotion item', error);
      res.status(500).json({ success: false, error: 'Failed to add promotion item' });
    }
  },

  updateItem: async (req: Request, res: Response) => {
    try {
      const { id, itemId } = req.params;
      const { product_id, customer_id, region_id, channel_id, discount_type, discount_value, estimated_volume, ml_model_id } = req.body;
      
      const result = await query(
        `UPDATE promotion_items
         SET product_id = $1, customer_id = $2, region_id = $3, channel_id = $4,
             discount_type = $5, discount_value = $6, estimated_volume = $7, ml_model_id = $8, updated_at = CURRENT_TIMESTAMP
         WHERE promotion_item_id = $9 AND promotion_id = $10
         RETURNING *`,
        [product_id, customer_id, region_id, channel_id, discount_type, discount_value, estimated_volume, ml_model_id, itemId, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion item not found' });
      }
      
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error('Error updating promotion item', error);
      res.status(500).json({ success: false, error: 'Failed to update promotion item' });
    }
  },

  deleteItem: async (req: Request, res: Response) => {
    try {
      const { id, itemId } = req.params;
      await query('DELETE FROM promotion_items WHERE promotion_item_id = $1 AND promotion_id = $2', [itemId, id]);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting promotion item', error);
      res.status(500).json({ success: false, error: 'Failed to delete promotion item' });
    }
  },

  estimateVolumes: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // Get promotion items
      const itemsResult = await query(
        `SELECT pi.*, pr.sku_name, c.customer_name
         FROM promotion_items pi
         LEFT JOIN products pr ON pi.product_id = pr.product_id
         LEFT JOIN customers c ON pi.customer_id = c.customer_id
         WHERE pi.promotion_id = $1`,
        [id]
      );
      
      // Estimate volumes using ML service
      const estimates = await Promise.all(
        itemsResult.rows.map(async (item) => {
          const estimate = await mlService.estimateVolume({
            product_id: item.product_id,
            customer_id: item.customer_id,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
            ml_model_id: item.ml_model_id
          });
          
          // Update estimated volume
          await query(
            `UPDATE promotion_items
             SET estimated_volume = $1, updated_at = CURRENT_TIMESTAMP
             WHERE promotion_item_id = $2`,
            [estimate.volume, item.promotion_item_id]
          );
          
          return {
            ...item,
            estimated_volume: estimate.volume,
            confidence: estimate.confidence
          };
        })
      );
      
      res.json({ success: true, data: estimates });
    } catch (error) {
      logger.error('Error estimating volumes', error);
      res.status(500).json({ success: false, error: 'Failed to estimate volumes' });
    }
  },


  /**
   * Update promotion scope - add/remove/update records based on new scope
   */
  updatePromotionScope: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        productIds, 
        customerIds, 
        regionIds, 
        channelIds, 
        startDate, 
        endDate, 
        discountPct 
      } = req.body;

      const promoId = parseInt(id);
      if (isNaN(promoId)) {
        return res.status(400).json({ success: false, error: 'Invalid promo_id' });
      }

      // Validate required fields
      if (!productIds || productIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one product must be selected' });
      }
      if (!customerIds || customerIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one customer must be selected' });
      }
      if (!regionIds || regionIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one region must be selected' });
      }
      if (!channelIds || channelIds.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one channel must be selected' });
      }
      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, error: 'Start date and end date are required' });
      }
      if (discountPct === undefined || discountPct === null) {
        return res.status(400).json({ success: false, error: 'Discount percentage is required' });
      }

      // Check if promotion exists
      const checkResult = await pcDbPool.query(`
        SELECT promo_id FROM fact_promotions WHERE promo_id = $1 LIMIT 1
      `, [promoId]);
      
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }

      // Get current record
      const currentRecordsResult = await pcDbPool.query(`
        SELECT product_id, customer_id, region_id, channel_id, time_id, promo_id, discount_pct
        FROM fact_promotions
        WHERE promo_id = $1
      `, [promoId]);

      const currentRecords = new Set(
        currentRecordsResult.rows.map(r => 
          `${r.product_id}-${r.customer_id}-${r.region_id}-${r.channel_id}-${r.time_id}`
        )
      );

      // Get new time_ids
      const timeResult = await pcDbPool.query(
        `SELECT time_id, date FROM time_m WHERE date >= $1 AND date <= $2 ORDER BY date`,
        [startDate, endDate]
      );

      if (timeResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'No time records found for the selected date range' });
      }

      const timeIds = timeResult.rows.map(row => row.time_id);

      // Generate new combinations
      const newCombinations: string[] = [];
      const newCombosWithIds: any[] = [];
      for (const productId of productIds) {
        for (const customerId of customerIds) {
          for (const regionId of regionIds) {
            for (const channelId of channelIds) {
              for (const timeId of timeIds) {
                const key = `${productId}-${customerId}-${regionId}-${channelId}-${timeId}`;
                newCombinations.push(key);
                newCombosWithIds.push({
                  product_id: productId,
                  customer_id: customerId,
                  region_id: regionId,
                  channel_id: channelId,
                  time_id: timeId
                });
              }
            }
          }
        }
      }

      const newCombinationsSet = new Set(newCombinations);

      // Identify records to add, update, and delete
      const toAdd = newCombosWithIds.filter(combo => 
        !currentRecords.has(`${combo.product_id}-${combo.customer_id}-${combo.region_id}-${combo.channel_id}-${combo.time_id}`)
      );
      const toDelete = currentRecordsResult.rows.filter(r => 
        !newCombinationsSet.has(`${r.product_id}-${r.customer_id}-${r.region_id}-${r.channel_id}-${r.time_id}`)
      );
      const toUpdate = currentRecordsResult.rows.filter(r => 
        newCombinationsSet.has(`${r.product_id}-${r.customer_id}-${r.region_id}-${r.channel_id}-${r.time_id}`) &&
        Number(r.discount_pct) !== Number(discountPct)
      );

      logger.info(`Updating promotion ${promoId}: Adding ${toAdd.length}, Updating ${toUpdate.length}, Deleting ${toDelete.length} records`);

      // Fetch product information for ML model
      const productInfoMap = new Map<number, { category_id: number | null, brand_id: number | null }>();
      const uniqueProductIds = [...new Set([...toAdd.map(c => c.product_id), ...toUpdate.map(r => r.product_id)])];
      if (uniqueProductIds.length > 0) {
        const productResult = await pcDbPool.query(
          `SELECT product_id, category_id, brand_id FROM Product_M WHERE product_id = ANY($1)`,
          [uniqueProductIds]
        );
        productResult.rows.forEach(row => {
          productInfoMap.set(row.product_id, {
            category_id: row.category_id,
            brand_id: row.brand_id
          });
        });
      }

      // Fetch snapshots for new/updated records per product-customer-time combination
      const snapshotMap = new Map<string, any>();
      if (isAvailable()) {
        const uniqueCombos = new Set([
          ...toAdd.map(c => `${c.product_id}-${c.customer_id}-${c.time_id}`),
          ...toUpdate.map(r => `${r.product_id}-${r.customer_id}-${r.time_id}`)
        ]);

        for (const combo of uniqueCombos) {
          const [productId, customerId, timeId] = combo.split('-').map(Number);
          
          // Validate that all IDs are valid numbers
          if (isNaN(productId) || isNaN(customerId) || isNaN(timeId)) {
            logger.warn(`Invalid combo string: ${combo}, skipping...`);
            continue;
          }
          
          try {
            const priceResult = await duckdbQuery(
              `SELECT base_price, rollup_customer_id 
               FROM Prices_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            const costResult = await duckdbQuery(
              `SELECT cogs, logs, rollup_customer_id 
               FROM Costs_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            const volumeResult = await duckdbQuery(
              `SELECT volume, rollup_customer_id, customer_id
               FROM Basevolume_allcombo_view 
               WHERE product_id = ${productId} 
               AND time_id = ${timeId}
               AND (customer_id = ${customerId} OR rollup_customer_id = ${customerId})
               ORDER BY 
                 CASE WHEN customer_id = ${customerId} AND rollup_customer_id = ${customerId} THEN 1
                      WHEN customer_id = ${customerId} THEN 2
                      ELSE 3 END
               LIMIT 1`
            );

            const basePrice = priceResult.length > 0 ? Number(priceResult[0].base_price) : null;
            const cogs = costResult.length > 0 ? Number(costResult[0].cogs) : null;
            const logs = costResult.length > 0 ? Number(costResult[0].logs) : null;
            const baseVolume = volumeResult.length > 0 ? Number(volumeResult[0].volume) : null;

            snapshotMap.set(combo, {
              base_price_snapshot: basePrice,
              cogs_snapshot: cogs,
              logs_snapshot: logs,
              base_volume_snapshot: baseVolume
            });
          } catch (error: any) {
            logger.warn(`Failed to fetch snapshots for product ${productId}, customer ${customerId}, time ${timeId}: ${error.message}`, error);
            snapshotMap.set(combo, {
              base_price_snapshot: null,
              cogs_snapshot: null,
              logs_snapshot: null,
              base_volume_snapshot: null
            });
          }
        }
      }

      const client = await pcDbPool.connect();
      try {
        await client.query('BEGIN');

        let recordsAdded = 0;
        let recordsUpdated = 0;
        let recordsDeleted = 0;

        // Delete records
        if (toDelete.length > 0) {
          const deleteIds = toDelete.map(r => r.promo_id);
          const deleteResult = await client.query(
            `DELETE FROM fact_promotions WHERE promo_id = ANY($1)`,
            [deleteIds]
          );
          recordsDeleted = deleteResult.rowCount || 0;
        }

        // Update records (discount changed)
        for (const record of toUpdate) {
          const snapshotKey = `${record.product_id}-${record.customer_id}-${record.time_id}`;
          const snapshots = snapshotMap.get(snapshotKey) || {
            base_price_snapshot: null,
            cogs_snapshot: null,
            logs_snapshot: null,
            base_volume_snapshot: null
          };

          const basePrice = snapshots.base_price_snapshot;
          const promoPrice = basePrice !== null 
            ? basePrice * (1 - Number(discountPct) / 100)
            : null;

          const baseVolume = snapshots.base_volume_snapshot;
          const productInfo = productInfoMap.get(record.product_id) || { category_id: null, brand_id: null };

          // Re-estimate promo volume
          let promoVolume: number | null = null;
          try {
            if (baseVolume !== null) {
              const volumeEstimate = await mlService.estimatePromoVolume({
                base_volume_snapshot: baseVolume,
                product_id: record.product_id,
                customer_id: record.customer_id,
                category_id: productInfo.category_id,
                brand_id: productInfo.brand_id,
                discount_pct: Number(discountPct)
              });
              promoVolume = volumeEstimate.promo_volume_estimate;
            }
          } catch (error: any) {
            logger.error(`Failed to estimate promo volume for promo_id ${record.promo_id}`, error);
          }

          // Calculate incremental metrics
          let incrementalVolume: number | null = null;
          let incrementalRevenue: number | null = null;
          let incrementalMargin: number | null = null;

          if (baseVolume !== null && promoVolume !== null) {
            incrementalVolume = promoVolume - baseVolume;
            if (promoPrice !== null && basePrice !== null) {
              incrementalRevenue = (promoVolume * promoPrice) - (baseVolume * basePrice);
              const cogs = snapshots.cogs_snapshot || 0;
              const logs = snapshots.logs_snapshot || 0;
              const totalCost = cogs + logs;
              const marginAtPromo = promoVolume * (promoPrice - totalCost);
              const marginAtBase = baseVolume * (basePrice - totalCost);
              incrementalMargin = marginAtPromo - marginAtBase;
            }
          }

          await client.query(`
            UPDATE fact_promotions
            SET 
              discount_pct = $1,
              promo_price_calculated = $2,
              promo_volume_estimate = $3,
              incremental_volume = $4,
              incremental_revenue = $5,
              incremental_margin = $6
            WHERE promo_id = $7
          `, [
            Number(discountPct),
            promoPrice,
            promoVolume,
            incrementalVolume,
            incrementalRevenue,
            incrementalMargin,
            record.promo_id
          ]);
          recordsUpdated++;
        }

        // Add new records
        const insertQuery = `
          INSERT INTO fact_promotions (
            product_id, customer_id, region_id, channel_id, time_id,
            discount_pct, promo_price_calculated,
            cogs_snapshot, logs_snapshot, base_price_snapshot,
            base_volume_snapshot, promo_volume_estimate,
            incremental_volume, incremental_revenue, incremental_margin
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          ) RETURNING promo_id
        `;

        const newlyInsertedIds: number[] = [];
        for (const combo of toAdd) {
          const snapshotKey = `${combo.product_id}-${combo.customer_id}-${combo.time_id}`;
          const snapshots = snapshotMap.get(snapshotKey) || {
            base_price_snapshot: null,
            cogs_snapshot: null,
            logs_snapshot: null,
            base_volume_snapshot: null
          };

          const basePrice = snapshots.base_price_snapshot;
          const promoPrice = basePrice !== null 
            ? basePrice * (1 - Number(discountPct) / 100)
            : null;

          const baseVolume = snapshots.base_volume_snapshot;
          const productInfo = productInfoMap.get(combo.product_id) || { category_id: null, brand_id: null };

          // Estimate promo volume using ML model
          let promoVolume: number | null = null;
          try {
            if (baseVolume !== null) {
              const volumeEstimate = await mlService.estimatePromoVolume({
                base_volume_snapshot: baseVolume,
                product_id: combo.product_id,
                customer_id: combo.customer_id,
                category_id: productInfo.category_id,
                brand_id: productInfo.brand_id,
                discount_pct: Number(discountPct)
              });
              promoVolume = volumeEstimate.promo_volume_estimate;
            }
          } catch (error: any) {
            logger.error(`Failed to estimate promo volume for new record`, error);
          }

          // Calculate incremental metrics
          let incrementalVolume: number | null = null;
          let incrementalRevenue: number | null = null;
          let incrementalMargin: number | null = null;

          if (baseVolume !== null && promoVolume !== null) {
            incrementalVolume = promoVolume - baseVolume;
            if (promoPrice !== null && basePrice !== null) {
              incrementalRevenue = (promoVolume * promoPrice) - (baseVolume * basePrice);
              const cogs = snapshots.cogs_snapshot || 0;
              const logs = snapshots.logs_snapshot || 0;
              const totalCost = cogs + logs;
              const marginAtPromo = promoVolume * (promoPrice - totalCost);
              const marginAtBase = baseVolume * (basePrice - totalCost);
              incrementalMargin = marginAtPromo - marginAtBase;
            }
          }

          const result = await client.query(insertQuery, [
            combo.product_id,
            combo.customer_id,
            combo.region_id,
            combo.channel_id,
            combo.time_id,
            Number(discountPct),
            promoPrice,
            snapshots.cogs_snapshot,
            snapshots.logs_snapshot,
            snapshots.base_price_snapshot,
            snapshots.base_volume_snapshot,
            promoVolume,
            incrementalVolume,
            incrementalRevenue,
            incrementalMargin
          ]);
          newlyInsertedIds.push(result.rows[0].promo_id);
          recordsAdded++;
        }

        await client.query('COMMIT');

        logger.info(`Successfully updated promotion ${promoId}: ${recordsAdded} added, ${recordsUpdated} updated, ${recordsDeleted} deleted`);

        // Verify newly inserted records exist in database
        if (newlyInsertedIds.length > 0) {
          const verifyResult = await pcDbPool.query(`
            SELECT COUNT(*) as count, 
                   COUNT(DISTINCT product_id) as product_count,
                   MIN(promo_id) as min_id,
                   MAX(promo_id) as max_id
            FROM fact_promotions
            WHERE promo_id = ANY($1)
          `, [newlyInsertedIds]);
          
          logger.info(`Verification: ${verifyResult.rows[0].count} of ${newlyInsertedIds.length} newly inserted records found in database. Product count: ${verifyResult.rows[0].product_count}, ID range: ${verifyResult.rows[0].min_id}-${verifyResult.rows[0].max_id}`);
          
          if (Number(verifyResult.rows[0].count) < newlyInsertedIds.length) {
            logger.warn(`WARNING: Only ${verifyResult.rows[0].count} of ${newlyInsertedIds.length} newly inserted records found`);
          }
        }

        res.json({
          success: true,
          data: {
            promotion_id: promotionId,
            promo_id: promoId, // Keep for backward compatibility
            records_added: recordsAdded,
            records_updated: recordsUpdated,
            records_deleted: recordsDeleted,
            message: `Promotion updated successfully: ${recordsAdded} records added, ${recordsUpdated} updated, ${recordsDeleted} deleted`
          }
        });
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Error updating promotion scope', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update promotion scope', 
        details: error.message 
      });
    }
  },

  /**
   * Update individual promotion line
   */
  updatePromotionLine: async (req: Request, res: Response) => {
    try {
      const { id, lineId } = req.params;
      const promoId = parseInt(id);
      const linePromoId = parseInt(lineId);

      if (isNaN(promoId) || isNaN(linePromoId)) {
        return res.status(400).json({ success: false, error: 'Invalid promo_id or line_id' });
      }

      // Check if promotion line exists
      const lineResult = await pcDbPool.query(
        `SELECT * FROM fact_promotions WHERE promo_id = $1`,
        [linePromoId]
      );

      if (lineResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Promotion line not found' });
      }

      const {
        product_id,
        customer_id,
        region_id,
        channel_id,
        time_id,
        discount_pct,
        base_volume_snapshot,
        promo_volume_estimate
      } = req.body;

      const existingLine = lineResult.rows[0];
      const productChanged = product_id !== undefined && product_id !== existingLine.product_id;
      const customerChanged = customer_id !== undefined && customer_id !== existingLine.customer_id;
      const discountChanged = discount_pct !== undefined && Number(discount_pct) !== Number(existingLine.discount_pct);

      // Fetch snapshots if product or customer changed
      let snapshots = {
        base_price_snapshot: existingLine.base_price_snapshot,
        cogs_snapshot: existingLine.cogs_snapshot,
        logs_snapshot: existingLine.logs_snapshot,
        base_volume_snapshot: existingLine.base_volume_snapshot
      };

      if ((productChanged || customerChanged || time_id !== undefined) && isAvailable()) {
        const finalProductId = product_id !== undefined ? product_id : existingLine.product_id;
        const finalCustomerId = customer_id !== undefined ? customer_id : existingLine.customer_id;
        const finalTimeId = time_id !== undefined ? time_id : existingLine.time_id;

        try {
          const priceResult = await duckdbQuery(
            `SELECT base_price FROM Prices_allcombo_view 
             WHERE product_id = ${finalProductId} 
             AND time_id = ${finalTimeId}
             AND (customer_id = ${finalCustomerId} OR rollup_customer_id = ${finalCustomerId})
             ORDER BY 
               CASE WHEN customer_id = ${finalCustomerId} AND rollup_customer_id = ${finalCustomerId} THEN 1
                    WHEN customer_id = ${finalCustomerId} THEN 2
                    ELSE 3 END
             LIMIT 1`
          );

          const costResult = await duckdbQuery(
            `SELECT cogs, logs FROM Costs_allcombo_view 
             WHERE product_id = ${finalProductId} 
             AND time_id = ${finalTimeId}
             AND (customer_id = ${finalCustomerId} OR rollup_customer_id = ${finalCustomerId})
             ORDER BY 
               CASE WHEN customer_id = ${finalCustomerId} AND rollup_customer_id = ${finalCustomerId} THEN 1
                    WHEN customer_id = ${finalCustomerId} THEN 2
                    ELSE 3 END
             LIMIT 1`
          );

          const volumeResult = await duckdbQuery(
            `SELECT volume FROM Basevolume_allcombo_view 
             WHERE product_id = ${finalProductId} 
             AND time_id = ${finalTimeId}
             AND (customer_id = ${finalCustomerId} OR rollup_customer_id = ${finalCustomerId})
             ORDER BY 
               CASE WHEN customer_id = ${finalCustomerId} AND rollup_customer_id = ${finalCustomerId} THEN 1
                    WHEN customer_id = ${finalCustomerId} THEN 2
                    ELSE 3 END
             LIMIT 1`
          );

          snapshots.base_price_snapshot = priceResult.length > 0 ? Number(priceResult[0].base_price) : null;
          snapshots.cogs_snapshot = costResult.length > 0 ? Number(costResult[0].cogs) : null;
          snapshots.logs_snapshot = costResult.length > 0 ? Number(costResult[0].logs) : null;
          snapshots.base_volume_snapshot = volumeResult.length > 0 ? Number(volumeResult[0].volume) : null;
        } catch (error: any) {
          logger.warn(`Failed to fetch snapshots for updated line`, error);
        }
      }

      // Use provided values or existing values
      const finalProductId = product_id !== undefined ? product_id : existingLine.product_id;
      const finalCustomerId = customer_id !== undefined ? customer_id : existingLine.customer_id;
      const finalRegionId = region_id !== undefined ? region_id : existingLine.region_id;
      const finalChannelId = channel_id !== undefined ? channel_id : existingLine.channel_id;
      const finalTimeId = time_id !== undefined ? time_id : existingLine.time_id;
      const finalDiscountPct = discount_pct !== undefined ? Number(discount_pct) : existingLine.discount_pct;
      const finalBaseVolume = base_volume_snapshot !== undefined ? base_volume_snapshot : snapshots.base_volume_snapshot;
      const finalPromoVolume = promo_volume_estimate !== undefined ? promo_volume_estimate : existingLine.promo_volume_estimate;

      // Calculate promo_price
      const promoPrice = snapshots.base_price_snapshot !== null 
        ? snapshots.base_price_snapshot * (1 - finalDiscountPct / 100)
        : null;

      // Calculate incremental metrics
      let incrementalVolume: number | null = null;
      let incrementalRevenue: number | null = null;
      let incrementalMargin: number | null = null;

      if (finalBaseVolume !== null && finalPromoVolume !== null) {
        incrementalVolume = finalPromoVolume - finalBaseVolume;
        if (promoPrice !== null && snapshots.base_price_snapshot !== null) {
          incrementalRevenue = (finalPromoVolume * promoPrice) - (finalBaseVolume * snapshots.base_price_snapshot);
          const cogs = snapshots.cogs_snapshot || 0;
          const logs = snapshots.logs_snapshot || 0;
          const totalCost = cogs + logs;
          const marginAtPromo = finalPromoVolume * (promoPrice - totalCost);
          const marginAtBase = finalBaseVolume * (snapshots.base_price_snapshot - totalCost);
          incrementalMargin = marginAtPromo - marginAtBase;
        }
      }

      // Update the record
      const updateResult = await pcDbPool.query(`
        UPDATE Fact_Promotions
        SET 
          product_id = $1,
          customer_id = $2,
          region_id = $3,
          channel_id = $4,
          time_id = $5,
          discount_pct = $6,
          promo_price_calculated = $7,
          cogs_snapshot = $8,
          logs_snapshot = $9,
          base_price_snapshot = $10,
          base_volume_snapshot = $11,
          promo_volume_estimate = $12,
          incremental_volume = $13,
          incremental_revenue = $14,
          incremental_margin = $15
        WHERE promo_id = $16
        RETURNING *
      `, [
        finalProductId,
        finalCustomerId,
        finalRegionId,
        finalChannelId,
        finalTimeId,
        finalDiscountPct,
        promoPrice,
        snapshots.cogs_snapshot,
        snapshots.logs_snapshot,
        snapshots.base_price_snapshot,
        finalBaseVolume,
        finalPromoVolume,
        incrementalVolume,
        incrementalRevenue,
        incrementalMargin,
        linePromoId
      ]);

      res.json({
        success: true,
        data: updateResult.rows[0],
        message: 'Promotion line updated successfully'
      });
    } catch (error: any) {
      logger.error('Error updating promotion line', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update promotion line', 
        details: error.message 
      });
    }
  },

  /**
   * Delete promotion lines
   */
  deletePromotionLines: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { promo_ids } = req.body;

      const promoId = parseInt(id);
      if (isNaN(promoId)) {
        return res.status(400).json({ success: false, error: 'Invalid promo_id' });
      }

      if (!Array.isArray(promo_ids) || promo_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'promo_ids array is required' });
      }

      // Verify all promo_ids exist
      const verifyResult = await pcDbPool.query(
        `SELECT promo_id FROM fact_promotions 
         WHERE promo_id = ANY($1)`,
        [promo_ids]
      );
      
      if (verifyResult.rows.length !== promo_ids.length) {
        const foundIds = verifyResult.rows.map(r => r.promo_id);
        const missingIds = promo_ids.filter(id => !foundIds.includes(id));
        return res.status(400).json({ 
          success: false, 
          error: `Some promo_ids not found: ${missingIds.join(', ')}` 
        });
      }

      // Delete the records
      const deleteResult = await pcDbPool.query(
        `DELETE FROM fact_promotions WHERE promo_id = ANY($1)`,
        [promo_ids]
      );

      res.json({
        success: true,
        data: {
          records_deleted: deleteResult.rowCount || 0,
          message: `Successfully deleted ${deleteResult.rowCount || 0} promotion line(s)`
        }
      });
    } catch (error: any) {
      logger.error('Error deleting promotion lines', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete promotion lines', 
        details: error.message 
      });
    }
  },

  /**
   * Delete entire promotion by promo_id
   * Deletes the promotion record in Fact_Promotions with the specified promo_id
   */
  deleteFactPromotion: async (req: Request, res: Response) => {
    try {
      const { promoId } = req.params;
      logger.info(`Delete promotion request received for promo_id: ${promoId}`);

      const promoIdNum = parseInt(promoId);
      if (isNaN(promoIdNum)) {
        logger.error(`Invalid promo ID provided: ${promoId}`);
        return res.status(400).json({ success: false, error: 'Invalid promo ID' });
      }

      // Check if promotion exists first
      const checkResult = await pcDbPool.query(
        `SELECT promo_id FROM fact_promotions WHERE promo_id = $1`,
        [promoIdNum]
      );
      
      if (checkResult.rows.length === 0) {
        logger.warn(`No record found for promo_id: ${promoIdNum}`);
        return res.status(404).json({ success: false, error: 'Promotion not found' });
      }

      // Delete the record
      const deleteResult = await pcDbPool.query(
        `DELETE FROM fact_promotions WHERE promo_id = $1`,
        [promoIdNum]
      );
      
      logger.info(`Successfully deleted promo_id: ${promoIdNum}`);

      res.json({
        success: true,
        data: {
          records_deleted: deleteResult.rowCount || 0,
          message: `Successfully deleted promotion with ${deleteResult.rowCount || 0} record(s)`
        }
      });
    } catch (error: any) {
      logger.error('Error deleting promotion', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete promotion', 
        details: error.message 
      });
    }
  },

  /**
   * Delete multiple promotions by promo_ids
   * Deletes records in Fact_Promotions with the specified promo_ids
   */
  deleteFactPromotionsBulk: async (req: Request, res: Response) => {
    try {
      const { promoIds } = req.body;

      if (!Array.isArray(promoIds) || promoIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'promoIds array is required and must not be empty' 
        });
      }

      // Validate all IDs are numbers
      const validIds = promoIds
        .map(id => parseInt(id.toString()))
        .filter(id => !isNaN(id));

      if (validIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'No valid promotion IDs provided' 
        });
      }

      // Delete records with these promo_ids
      const deleteResult = await pcDbPool.query(
        `DELETE FROM fact_promotions WHERE promo_id = ANY($1)`,
        [validIds]
      );

      const totalRecordsDeleted = deleteResult.rowCount || 0;
      const promotionsDeleted = promotionCounts.size;

      res.json({
        success: true,
        data: {
          promotions_deleted: promotionsDeleted,
          total_records_deleted: totalRecordsDeleted,
          message: `Successfully deleted ${promotionsDeleted} promotion record(s)`
        }
      });
    } catch (error: any) {
      logger.error('Error deleting promotions in bulk', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete promotions', 
        details: error.message 
      });
    }
  }
};

