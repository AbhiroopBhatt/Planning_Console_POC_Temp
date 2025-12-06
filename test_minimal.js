/**
 * Minimal test - just test the MAX query and one INSERT
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

async function testMinimal() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Test MAX query
    console.log('1. Testing MAX query...');
    const maxResult = await client.query(`
      SELECT COALESCE(MAX("Promotion_ID"), 0) + 1 as next_promotion_id
      FROM fact_promotions
    `);
    const promotionId = maxResult.rows[0].next_promotion_id;
    console.log(`   ✅ MAX query works, next ID: ${promotionId}`);
    
    // Test INSERT
    console.log('2. Testing INSERT query...');
    const insertResult = await client.query(`
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
    `, [
      promotionId, 1, 4, 1, 1, 1, 10, null, null, null, null, null, null, null, null, null
    ]);
    console.log(`   ✅ INSERT works, promo_id: ${insertResult.rows[0].promo_id}`);
    
    await client.query('ROLLBACK');
    console.log('\n✅ All queries work! The issue must be elsewhere in the code.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error('Code:', error.code);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.position) console.error('Position:', error.position);
  } finally {
    client.release();
    await pool.end();
  }
}

testMinimal();

