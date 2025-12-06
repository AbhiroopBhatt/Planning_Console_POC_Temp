import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

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

interface VolumeEstimateRequest {
  base_volume_snapshot: number | null;
  product_id: number;
  customer_id: number;
  category_id: number | null;
  brand_id: number | null;
  discount_pct: number;
}

interface VolumeEstimate {
  promo_volume_estimate: number | null;
  model_version: string | null;
  multipliers_used: {
    category?: number;
    brand?: number;
    customer?: number;
    product?: number;
    discount?: number;
  };
}

export const mlService = {
  /**
   * Get the currently active ML model configuration
   */
  async getActiveModel() {
    try {
      const result = await pcDbPool.query(
        `SELECT * FROM ML_Model_Config WHERE is_active = true LIMIT 1`
      );
      return result.rows[0] || null;
    } catch (error: any) {
      logger.error('Error fetching active ML model', error);
      return null;
    }
  },

  /**
   * Get coefficient for a specific entity type and ID
   */
  async getCoefficient(
    modelId: number,
    entityType: 'category' | 'brand' | 'customer' | 'product' | 'discount_tier',
    entityId: number | null,
    discountPct?: number
  ): Promise<number> {
    try {
      if (entityType === 'discount_tier') {
        // For discount tiers, match based on discount_pct range
        const result = await pcDbPool.query(
          `SELECT coefficient_value 
           FROM ML_Model_Coefficients 
           WHERE model_id = $1 
           AND entity_type = $2 
           AND $3 >= COALESCE(discount_min_pct, 0) 
           AND $3 <= COALESCE(discount_max_pct, 999)
           LIMIT 1`,
          [modelId, entityType, discountPct || 0]
        );
        const coefficient = result.rows[0]?.coefficient_value ? Number(result.rows[0].coefficient_value) : 0;
        logger.info(`Fetched discount_tier coefficient for discount_pct ${discountPct}: ${coefficient}`);
        return coefficient;
      } else {
        // For other entity types, match by entity_id
        if (entityId === null || entityId === undefined) {
          logger.info(`Skipping coefficient fetch for ${entityType}: entity_id is null`);
          return 0;
        }
        const result = await pcDbPool.query(
          `SELECT coefficient_value 
           FROM ML_Model_Coefficients 
           WHERE model_id = $1 
           AND entity_type = $2 
           AND entity_id = $3
           LIMIT 1`,
          [modelId, entityType, entityId]
        );
        const coefficient = result.rows[0]?.coefficient_value ? Number(result.rows[0].coefficient_value) : 0;
        if (coefficient === 0 && result.rows.length === 0) {
          logger.warn(`No coefficient found for ${entityType} with entity_id ${entityId}, model_id ${modelId} - using default 0`);
        }
        return coefficient;
      }
    } catch (error: any) {
      logger.error(`Error fetching coefficient for ${entityType} ${entityId !== null ? entityId : `discount_pct=${discountPct}`}:`, error);
      logger.error('Error details:', error.message);
      return 0;
    }
  },

  /**
   * Estimate promo volume using multiplier-based model
   */
  async estimatePromoVolume(request: VolumeEstimateRequest): Promise<VolumeEstimate> {
    try {
      // If base volume is null, cannot estimate
      if (request.base_volume_snapshot === null || request.base_volume_snapshot === undefined) {
        logger.info(`ML Volume Estimation skipped: base_volume_snapshot is null for product ${request.product_id}, customer ${request.customer_id}`);
        return {
          promo_volume_estimate: null,
          model_version: null,
          multipliers_used: {}
        };
      }

      // Get active model
      const activeModel = await this.getActiveModel();
      if (!activeModel) {
        logger.warn('No active ML model found, skipping volume estimation');
        return {
          promo_volume_estimate: null,
          model_version: null,
          multipliers_used: {}
        };
      }
      
      logger.info(`ML Volume Estimation started: Model ${activeModel.model_name} v${activeModel.model_version} for product ${request.product_id}, customer ${request.customer_id}, base_volume: ${request.base_volume_snapshot}`);

      const modelId = activeModel.model_id;
      const modelVersion = activeModel.model_version;

      // Fetch all required coefficients in parallel
      const [
        categoryMultiplier,
        brandMultiplier,
        customerMultiplier,
        productMultiplier,
        discountMultiplier
      ] = await Promise.all([
        request.category_id 
          ? this.getCoefficient(modelId, 'category', request.category_id)
          : Promise.resolve(0),
        request.brand_id 
          ? this.getCoefficient(modelId, 'brand', request.brand_id)
          : Promise.resolve(0),
        this.getCoefficient(modelId, 'customer', request.customer_id),
        this.getCoefficient(modelId, 'product', request.product_id),
        this.getCoefficient(modelId, 'discount_tier', null, request.discount_pct)
      ]);

      // Apply formula: promo_volume = base_volume * (1 + sum of all multipliers)
      const totalMultiplier = categoryMultiplier + brandMultiplier + customerMultiplier + productMultiplier + discountMultiplier;
      let promoVolume = request.base_volume_snapshot * (1 + totalMultiplier);

      // Ensure promo volume is never negative
      promoVolume = Math.max(0, promoVolume);

      logger.info(`ML Volume Estimation - Model: ${activeModel.model_name} v${modelVersion}, Base: ${request.base_volume_snapshot}, Multipliers: C=${categoryMultiplier}, B=${brandMultiplier}, Cu=${customerMultiplier}, P=${productMultiplier}, D=${discountMultiplier}, Total: ${totalMultiplier}, Estimated: ${promoVolume}`);

      return {
        promo_volume_estimate: Math.round(promoVolume * 100) / 100, // Round to 2 decimal places
        model_version: modelVersion,
        multipliers_used: {
          category: categoryMultiplier,
          brand: brandMultiplier,
          customer: customerMultiplier,
          product: productMultiplier,
          discount: discountMultiplier
        }
      };
    } catch (error: any) {
      logger.error(`Error estimating promo volume for product ${request.product_id}, customer ${request.customer_id}:`, error);
      logger.error('Error stack:', error.stack);
      // Don't throw - return null so promotion creation can continue
      return {
        promo_volume_estimate: null,
        model_version: null,
        multipliers_used: {}
      };
    }
  },

  /**
   * Legacy method for backward compatibility (kept for existing code)
   */
  async estimateVolume(request: any): Promise<any> {
    logger.warn('estimateVolume is deprecated, use estimatePromoVolume instead');
    return {
      volume: 0,
      confidence: 0
    };
  }
};
