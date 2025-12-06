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

async function checkPromo626Details() {
  const client = await pcDbPool.connect();
  try {
    console.log('=== Checking Promotion 626 Details ===\n');
    
    // Find the promotion group
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
        WHERE promo_id = 626
      ),
      group_range AS (
        SELECT MIN(promo_id) as min_promo_id, MAX(promo_id) as max_promo_id
        FROM ranked r
        INNER JOIN target_group tg ON r.discount_pct = tg.discount_pct AND r.grp = tg.grp
      )
      SELECT * FROM group_range
    `);
    
    if (promoGroup.rows.length === 0) {
      console.log('Promotion 626 not found');
      return;
    }
    
    const { min_promo_id, max_promo_id } = promoGroup.rows[0];
    
    // Get all records with customer names
    const records = await client.query(`
      SELECT 
        fp.promo_id,
        fp.product_id,
        fp.customer_id,
        c.customer_name,
        fp.base_volume_snapshot,
        fp.promo_volume_estimate,
        fp.discount_pct,
        p.category_id,
        p.brand_id,
        p.sku_name,
        CASE 
          WHEN fp.base_volume_snapshot IS NULL THEN 'NULL base volume'
          WHEN fp.promo_volume_estimate IS NULL THEN 'NULL promo volume'
          ELSE 'Has promo volume'
        END as status
      FROM Fact_Promotions fp
      LEFT JOIN Product_M p ON fp.product_id = p.product_id
      LEFT JOIN Customer_H c ON fp.customer_id = c.customer_id
      WHERE fp.promo_id >= $1 AND fp.promo_id <= $2
      ORDER BY c.customer_name, fp.product_id, fp.promo_id
    `, [min_promo_id, max_promo_id]);
    
    console.log(`Total records: ${records.rows.length}\n`);
    
    // Group by customer
    const byCustomer = new Map();
    for (const record of records.rows) {
      const customerName = record.customer_name || 'Unknown';
      if (!byCustomer.has(customerName)) {
        byCustomer.set(customerName, {
          total: 0,
          withBaseVolume: 0,
          withPromoVolume: 0,
          nullBaseVolume: 0,
          nullPromoVolume: 0,
          records: []
        });
      }
      const stats = byCustomer.get(customerName);
      stats.total++;
      if (record.base_volume_snapshot !== null) stats.withBaseVolume++;
      else stats.nullBaseVolume++;
      if (record.promo_volume_estimate !== null) stats.withPromoVolume++;
      else stats.nullPromoVolume++;
      stats.records.push(record);
    }
    
    // Print summary by customer
    console.log('=== Summary by Customer ===');
    for (const [customerName, stats] of byCustomer.entries()) {
      console.log(`\n${customerName}:`);
      console.log(`  Total records: ${stats.total}`);
      console.log(`  With base volume: ${stats.withBaseVolume}`);
      console.log(`  With promo volume: ${stats.withPromoVolume}`);
      console.log(`  Null base volumes: ${stats.nullBaseVolume}`);
      console.log(`  Null promo volumes: ${stats.nullPromoVolume}`);
    }
    
    // Check Tesco specifically
    console.log('\n=== Detailed Tesco Records ===');
    const tescoRecords = records.rows.filter(r => 
      r.customer_name && r.customer_name.toLowerCase().includes('tesco')
    );
    
    if (tescoRecords.length === 0) {
      console.log('No Tesco records found');
    } else {
      console.log(`\nFound ${tescoRecords.length} Tesco records:\n`);
      
      const withPromo = tescoRecords.filter(r => r.promo_volume_estimate !== null);
      const withoutPromo = tescoRecords.filter(r => r.promo_volume_estimate === null);
      
      console.log(`Records WITH promo volume: ${withPromo.length}`);
      if (withPromo.length > 0) {
        console.log('\nSample records WITH promo volume:');
        for (const record of withPromo.slice(0, 3)) {
          console.log(`  Promo ID: ${record.promo_id}, Product: ${record.sku_name || record.product_id}`);
          console.log(`    Base volume: ${record.base_volume_snapshot}`);
          console.log(`    Promo volume: ${record.promo_volume_estimate}`);
          console.log(`    Category: ${record.category_id}, Brand: ${record.brand_id}`);
          console.log(`    Discount: ${record.discount_pct}%`);
        }
      }
      
      console.log(`\nRecords WITHOUT promo volume: ${withoutPromo.length}`);
      if (withoutPromo.length > 0) {
        console.log('\nSample records WITHOUT promo volume:');
        for (const record of withoutPromo.slice(0, 5)) {
          console.log(`  Promo ID: ${record.promo_id}, Product: ${record.sku_name || record.product_id}`);
          console.log(`    Base volume: ${record.base_volume_snapshot || 'NULL'}`);
          console.log(`    Promo volume: ${record.promo_volume_estimate || 'NULL'}`);
          console.log(`    Category: ${record.category_id || 'NULL'}, Brand: ${record.brand_id || 'NULL'}`);
          console.log(`    Discount: ${record.discount_pct}%`);
          console.log(`    Status: ${record.status}`);
        }
      }
      
      // Check if there's a pattern
      console.log('\n=== Pattern Analysis ===');
      const withoutPromoButWithBase = withoutPromo.filter(r => r.base_volume_snapshot !== null);
      console.log(`Records without promo volume BUT with base volume: ${withoutPromoButWithBase.length}`);
      
      if (withoutPromoButWithBase.length > 0) {
        console.log('\nThese should have promo volumes but don\'t:');
        for (const record of withoutPromoButWithBase.slice(0, 3)) {
          console.log(`  Promo ID: ${record.promo_id}`);
          console.log(`    Product ID: ${record.product_id}, Customer ID: ${record.customer_id}`);
          console.log(`    Base volume: ${record.base_volume_snapshot}`);
          console.log(`    Category: ${record.category_id}, Brand: ${record.brand_id}`);
        }
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
  checkPromo626Details()
    .then(() => {
      console.log('\n✓ Diagnostic complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Diagnostic failed:', error);
      process.exit(1);
    });
}

export { checkPromo626Details };
