/**
 * Diagnostic script to check Fact_Promotions table structure
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

async function checkTable() {
  try {
    console.log('Checking Fact_Promotions table structure...\n');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name = 'Fact_Promotions' OR LOWER(table_name) = 'fact_promotions')
    `);
    
    if (tableCheck.rows.length === 0) {
      console.log('❌ Table Fact_Promotions does not exist!');
      console.log('Available tables:');
      const allTables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      allTables.rows.forEach(row => console.log(`  - ${row.table_name}`));
      return;
    }
    
    console.log('✅ Table exists:', tableCheck.rows[0].table_name);
    
    // Get all columns
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND (table_name = 'Fact_Promotions' OR LOWER(table_name) = 'fact_promotions')
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Columns in Fact_Promotions:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Check specifically for promotion ID columns
    const promotionIdCols = columns.rows.filter(col => 
      col.column_name.toLowerCase().includes('promotion') && 
      col.column_name.toLowerCase().includes('id')
    );
    
    console.log('\n🔍 Promotion ID related columns:');
    if (promotionIdCols.length === 0) {
      console.log('  ❌ No promotion ID columns found!');
    } else {
      promotionIdCols.forEach(col => {
        console.log(`  - ${col.column_name} (exact case)`);
      });
    }
    
    // Try to query with different column name variations
    console.log('\n🧪 Testing queries:');
    
    try {
      const test1 = await pool.query('SELECT "Promotion_ID" FROM fact_promotions LIMIT 1');
      console.log('  ✅ Query with "Promotion_ID" FROM fact_promotions works');
    } catch (e) {
      console.log('  ❌ Query with "Promotion_ID" FROM fact_promotions failed:', e.message);
    }
    
    try {
      const test2 = await pool.query('SELECT promotion_id FROM fact_promotions LIMIT 1');
      console.log('  ✅ Query with promotion_id (lowercase unquoted) works');
    } catch (e) {
      console.log('  ❌ Query with promotion_id (lowercase unquoted) failed:', e.message);
    }
    
    try {
      const test3 = await pool.query('SELECT "promotion_id" FROM fact_promotions LIMIT 1');
      console.log('  ✅ Query with "promotion_id" (quoted lowercase) works');
    } catch (e) {
      console.log('  ❌ Query with "promotion_id" (quoted lowercase) failed:', e.message);
    }
    
    // Test INSERT with different column name variations
    console.log('\n🧪 Testing INSERT queries:');
    try {
      await pool.query('BEGIN');
      const testInsert1 = await pool.query(`
        INSERT INTO fact_promotions ("Promotion_ID", product_id, customer_id, region_id, channel_id, time_id, discount_pct)
        VALUES (9999, 1, 4, 1, 1, 1, 10) RETURNING promo_id
      `);
      await pool.query('ROLLBACK');
      console.log('  ✅ INSERT with "Promotion_ID" works');
    } catch (e) {
      await pool.query('ROLLBACK');
      console.log('  ❌ INSERT with "Promotion_ID" failed:', e.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

checkTable();

