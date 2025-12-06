/**
 * Test the INSERT query directly
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: 'pc_postgres_db',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

async function testInsert() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get next promotion ID
    const promotionIdResult = await client.query(`
      SELECT COALESCE(MAX("Promotion_ID"), 0) + 1 as next_promotion_id
      FROM fact_promotions
    `);
    const promotionId = promotionIdResult.rows[0].next_promotion_id;
    console.log('Next Promotion_ID:', promotionId);
    
    // Test INSERT with minimal data
    const insertQuery = `
      INSERT INTO fact_promotions (
        "Promotion_ID",
        product_id, customer_id, region_id, channel_id, time_id,
        discount_pct, promo_price_calculated,
        cogs_snapshot, logs_snapshot, base_price_snapshot,
        base_volume_snapshot, promo_volume_estimate,
        incremental_volume, incremental_revenue, incremental_margin
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      ) RETURNING promo_id
    `;
    
    console.log('\nTesting INSERT query...');
    const result = await client.query(insertQuery, [
      promotionId,
      1,    // product_id
      4,    // customer_id
      1,    // region_id
      1,    // channel_id
      1,    // time_id
      10,   // discount_pct
      null, // promo_price_calculated
      null, // cogs_snapshot
      null, // logs_snapshot
      null, // base_price_snapshot
      null, // base_volume_snapshot
      null, // promo_volume_estimate
      null, // incremental_volume
      null, // incremental_revenue
      null  // incremental_margin
    ]);
    
    console.log('✅ INSERT succeeded! promo_id:', result.rows[0].promo_id);
    
    // Rollback the test insert
    await client.query('ROLLBACK');
    console.log('✅ Test completed successfully (rolled back)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    if (error.detail) {
      console.error('Detail:', error.detail);
    }
    if (error.position) {
      console.error('Position:', error.position);
    }
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testInsert();

