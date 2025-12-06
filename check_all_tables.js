/**
 * Check all table names in the database
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

async function checkTables() {
  try {
    console.log('Checking table names...\n');
    
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND (table_name LIKE '%time%' OR table_name LIKE '%product%' OR table_name LIKE '%promotion%')
      ORDER BY table_name
    `);
    
    console.log('📋 Relevant tables:');
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Test queries with different case variations
    console.log('\n🧪 Testing Time_M vs time_m:');
    try {
      await pool.query('SELECT time_id FROM Time_M LIMIT 1');
      console.log('  ✅ Time_M (mixed case) works');
    } catch (e) {
      console.log('  ❌ Time_M failed:', e.message);
    }
    
    try {
      await pool.query('SELECT time_id FROM time_m LIMIT 1');
      console.log('  ✅ time_m (lowercase) works');
    } catch (e) {
      console.log('  ❌ time_m failed:', e.message);
    }
    
    // Test Product_M
    console.log('\n🧪 Testing Product_M vs product_m:');
    try {
      await pool.query('SELECT product_id FROM Product_M LIMIT 1');
      console.log('  ✅ Product_M (mixed case) works');
    } catch (e) {
      console.log('  ❌ Product_M failed:', e.message);
    }
    
    try {
      await pool.query('SELECT product_id FROM product_m LIMIT 1');
      console.log('  ✅ product_m (lowercase) works');
    } catch (e) {
      console.log('  ❌ product_m failed:', e.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();

