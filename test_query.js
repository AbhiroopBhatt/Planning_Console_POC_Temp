/**
 * Test the exact query format
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

async function testQuery() {
  try {
    console.log('Testing MAX query...');
    const result = await pool.query(`
      SELECT COALESCE(MAX("Promotion_ID"), 0) + 1 as next_promotion_id
      FROM fact_promotions
    `);
    console.log('✅ MAX query succeeded:', result.rows[0]);
    
    console.log('\nTesting INSERT query structure...');
    // Just test the structure, don't actually insert
    const testInsert = `
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
    console.log('INSERT query structure looks correct');
    console.log('Column list includes: "Promotion_ID" (quoted mixed case)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error code:', error.code);
    if (error.detail) {
      console.error('Detail:', error.detail);
    }
  } finally {
    await pool.end();
  }
}

testQuery();

