/**
 * Test the full flow exactly as the API does it
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

async function testFullFlow() {
  const client = await pool.connect();
  try {
    console.log('=== Testing Full Flow ===\n');
    
    // Step 1: Get time_ids
    console.log('1. Getting time_ids...');
    const timeResult = await client.query(
      `SELECT time_id, date FROM time_m WHERE date >= $1 AND date <= $2 ORDER BY date`,
      ['2025-01-01', '2025-01-01']
    );
    console.log(`   ✅ Found ${timeResult.rows.length} time records`);
    const timeIds = timeResult.rows.map(row => row.time_id);
    
    // Step 2: Get product info
    console.log('\n2. Getting product info...');
    const productResult = await client.query(
      `SELECT product_id, category_id, brand_id FROM product_m WHERE product_id = ANY($1)`,
      [[1]]
    );
    console.log(`   ✅ Found ${productResult.rows.length} products`);
    
    // Step 3: Begin transaction
    console.log('\n3. Beginning transaction...');
    await client.query('BEGIN');
    console.log('   ✅ Transaction begun');
    
    // Step 4: Get next Promotion_ID
    console.log('\n4. Getting next Promotion_ID...');
    const promotionIdResult = await client.query(`
      SELECT COALESCE(MAX("Promotion_ID"), 0) + 1 as next_promotion_id
      FROM fact_promotions
    `);
    const promotionId = promotionIdResult.rows[0].next_promotion_id;
    console.log(`   ✅ Next Promotion_ID: ${promotionId}`);
    
    // Step 5: Prepare record (simulating what the code does)
    console.log('\n5. Preparing record...');
    const record = {
      product_id: 1,
      customer_id: 4,
      region_id: 1,
      channel_id: 1,
      time_id: timeIds[0],
      discount_pct: 10,
      promo_price_calculated: null,
      cogs_snapshot: null,
      logs_snapshot: null,
      base_price_snapshot: null,
      base_volume_snapshot: null,
      promo_volume_estimate: null,
      incremental_volume: null,
      incremental_revenue: null,
      incremental_margin: null
    };
    console.log('   ✅ Record prepared');
    
    // Step 6: Insert
    console.log('\n6. Inserting record...');
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
    
    const result = await client.query(insertQuery, [
      promotionId,
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
    console.log(`   ✅ Inserted successfully, promo_id: ${result.rows[0].promo_id}`);
    
    // Step 7: Commit
    console.log('\n7. Committing transaction...');
    await client.query('COMMIT');
    console.log('   ✅ Committed');
    
    // Step 8: Rollback the test data
    console.log('\n8. Rolling back test data...');
    await client.query('BEGIN');
    await client.query('DELETE FROM fact_promotions WHERE promo_id = $1', [result.rows[0].promo_id]);
    await client.query('COMMIT');
    console.log('   ✅ Test data cleaned up');
    
    console.log('\n✅ All steps completed successfully!');
    console.log('The issue must be in the API code flow, not in the database queries themselves.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error at step:', error.message);
    console.error('Code:', error.code);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.position) console.error('Position:', error.position);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testFullFlow();

