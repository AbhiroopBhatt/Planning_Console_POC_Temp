import { Pool } from 'pg';
import dotenv from 'dotenv';

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

async function checkPromoVolumes() {
  const client = await pcDbPool.connect();
  try {
    console.log('=== Checking ML Model Configuration ===');
    const modelCheck = await client.query(`
      SELECT model_id, model_name, model_version, is_active 
      FROM ML_Model_Config 
      WHERE is_active = true
    `);
    console.log('Active ML Models:', modelCheck.rows);
    
    if (modelCheck.rows.length === 0) {
      console.log('❌ ERROR: No active ML model found!');
      return;
    }
    
    const modelId = modelCheck.rows[0].model_id;
    console.log(`\n=== Checking Coefficients for Model ID ${modelId} ===`);
    const coeffCheck = await client.query(`
      SELECT entity_type, COUNT(*) as count 
      FROM ML_Model_Coefficients 
      WHERE model_id = $1
      GROUP BY entity_type
      ORDER BY entity_type
    `, [modelId]);
    console.log('Coefficient counts:', coeffCheck.rows);
    
    console.log('\n=== Checking Specific Promotions ===');
    const promoIds = [551, 596, 626];
    
    for (const promoId of promoIds) {
      console.log(`\n--- Promotion ${promoId} ---`);
      
      // Find the promotion group (get min promo_id in the group)
      const promoGroup = await client.query(`
        WITH ranked AS (
          SELECT 
            promo_id,
            discount_pct,
            ROW_NUMBER() OVER (ORDER BY promo_id) as rn,
            promo_id - ROW_NUMBER() OVER (PARTITION BY discount_pct ORDER BY promo_id) as grp
          FROM Fact_Promotions
        ),
        target_group AS (
          SELECT discount_pct, grp
          FROM ranked
          WHERE promo_id = $1
        ),
        group_range AS (
          SELECT MIN(promo_id) as min_promo_id, MAX(promo_id) as max_promo_id
          FROM ranked r
          INNER JOIN target_group tg ON r.discount_pct = tg.discount_pct AND r.grp = tg.grp
        )
        SELECT * FROM group_range
      `, [promoId]);
      
      if (promoGroup.rows.length === 0) {
        console.log(`  ❌ Promotion ${promoId} not found`);
        continue;
      }
      
      const { min_promo_id, max_promo_id } = promoGroup.rows[0];
      
      const promoData = await client.query(`
        SELECT 
          COUNT(*) as total_records,
          COUNT(base_volume_snapshot) as records_with_base_volume,
          COUNT(promo_volume_estimate) as records_with_promo_volume,
          SUM(CASE WHEN base_volume_snapshot IS NULL THEN 1 ELSE 0 END) as null_base_volumes,
          SUM(CASE WHEN promo_volume_estimate IS NULL THEN 1 ELSE 0 END) as null_promo_volumes,
          AVG(base_volume_snapshot) as avg_base_volume,
          AVG(promo_volume_estimate) as avg_promo_volume
        FROM Fact_Promotions
        WHERE promo_id >= $1 AND promo_id <= $2
      `, [min_promo_id, max_promo_id]);
      
      const stats = promoData.rows[0];
      console.log(`  Total records: ${stats.total_records}`);
      console.log(`  Records with base_volume: ${stats.records_with_base_volume}`);
      console.log(`  Records with promo_volume: ${stats.records_with_promo_volume}`);
      console.log(`  Null base volumes: ${stats.null_base_volumes}`);
      console.log(`  Null promo volumes: ${stats.null_promo_volumes}`);
      console.log(`  Avg base volume: ${stats.avg_base_volume || 'N/A'}`);
      console.log(`  Avg promo volume: ${stats.avg_promo_volume || 'N/A'}`);
      
      // Check a sample record
      const sample = await client.query(`
        SELECT 
          fp.product_id,
          fp.customer_id,
          fp.base_volume_snapshot,
          fp.promo_volume_estimate,
          fp.discount_pct,
          p.category_id,
          p.brand_id
        FROM Fact_Promotions fp
        LEFT JOIN Product_M p ON fp.product_id = p.product_id
        WHERE fp.promo_id >= $1 AND fp.promo_id <= $2
        LIMIT 3
      `, [min_promo_id, max_promo_id]);
      
      console.log(`  Sample records:`);
      for (const row of sample.rows) {
        console.log(`    Product ${row.product_id}, Customer ${row.customer_id}:`);
        console.log(`      Base volume: ${row.base_volume_snapshot || 'NULL'}`);
        console.log(`      Promo volume: ${row.promo_volume_estimate || 'NULL'}`);
        console.log(`      Discount: ${row.discount_pct}%`);
        console.log(`      Category: ${row.category_id || 'NULL'}, Brand: ${row.brand_id || 'NULL'}`);
      }
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pcDbPool.end();
  }
}

if (require.main === module) {
  checkPromoVolumes()
    .then(() => {
      console.log('\n✓ Diagnostic complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Diagnostic failed:', error);
      process.exit(1);
    });
}

export { checkPromoVolumes };
