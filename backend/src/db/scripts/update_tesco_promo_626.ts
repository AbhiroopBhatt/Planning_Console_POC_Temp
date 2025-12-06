import { Pool } from 'pg';
import dotenv from 'dotenv';
import { mlService } from '../../services/mlService';

dotenv.config();

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

async function updateTescoPromo626() {
  const client = await pcDbPool.connect();
  try {
    console.log('=== Updating Tesco Records in Promotion 626 ===\n');
    
    // Get active model
    const activeModel = await mlService.getActiveModel();
    if (!activeModel) {
      console.error('❌ No active ML model found');
      return;
    }
    console.log(`✓ Using ML Model: ${activeModel.model_name} v${activeModel.model_version}\n`);
    
    // Find promotion 626 records for Tesco (customer_id = 2) that don't have promo volumes
    const records = await client.query(`
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
      FROM Fact_Promotions fp
      LEFT JOIN Product_M p ON fp.product_id = p.product_id
      WHERE fp.promo_id >= 626 AND fp.promo_id <= 700
        AND fp.customer_id = 2
        AND fp.base_volume_snapshot IS NOT NULL
        AND fp.promo_volume_estimate IS NULL
      ORDER BY fp.promo_id
    `);
    
    console.log(`Found ${records.rows.length} Tesco records to update\n`);
    
    if (records.rows.length === 0) {
      console.log('No records to update');
      return;
    }
    
    await client.query('BEGIN');
    
    let updated = 0;
    let failed = 0;
    
    for (const record of records.rows) {
      try {
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
          console.log(`  ⚠ Skipping promo_id ${record.promo_id}: ML estimation returned null`);
          failed++;
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
          UPDATE Fact_Promotions
          SET 
            promo_volume_estimate = $1,
            incremental_volume = $2,
            incremental_revenue = $3,
            incremental_margin = $4
          WHERE promo_id = $5
        `, [promoVolume, incrementalVolume, incrementalRevenue, incrementalMargin, record.promo_id]);
        
        updated++;
        if (updated % 10 === 0) {
          console.log(`  Updated ${updated} records...`);
        }
      } catch (error: any) {
        console.error(`  ❌ Error updating promo_id ${record.promo_id}:`, error.message);
        failed++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✓ Update complete:`);
    console.log(`  Updated: ${updated} records`);
    console.log(`  Failed: ${failed} records`);
    
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pcDbPool.end();
  }
}

if (require.main === module) {
  updateTescoPromo626()
    .then(() => {
      console.log('\n✓ Script complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { updateTescoPromo626 };
