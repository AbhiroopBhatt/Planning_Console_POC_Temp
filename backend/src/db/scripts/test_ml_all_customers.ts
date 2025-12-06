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

async function testMLAllCustomers() {
  const client = await pcDbPool.connect();
  try {
    console.log('=== Testing ML Volume Estimation for All Customers ===\n');
    console.log('Parameters:');
    console.log('  Product ID: 1');
    console.log('  Date Range: 2025-01-01 to 2025-01-15');
    console.log('  Region: Any (will use first available)');
    console.log('  Channel: Any (will use first available)');
    console.log('  Discount: 20%\n');

    // Get active model
    const activeModel = await mlService.getActiveModel();
    if (!activeModel) {
      console.error('❌ No active ML model found');
      return;
    }
    console.log(`✓ Using ML Model: ${activeModel.model_name} v${activeModel.model_version}\n`);

    // Get product info
    const productResult = await client.query(
      'SELECT product_id, sku_name, category_id, brand_id FROM Product_M WHERE product_id = 1'
    );
    
    if (productResult.rows.length === 0) {
      console.error('❌ Product ID 1 not found');
      return;
    }
    
    const product = productResult.rows[0];
    console.log(`Product: ${product.sku_name || `ID ${product.product_id}`}`);
    console.log(`  Category ID: ${product.category_id || 'NULL'}`);
    console.log(`  Brand ID: ${product.brand_id || 'NULL'}\n`);

    // Get first available region and channel
    const regionResult = await client.query('SELECT region_id, region_name FROM Region_H LIMIT 1');
    const channelResult = await client.query('SELECT channel_id, channel_name FROM Channel_M LIMIT 1');
    
    if (regionResult.rows.length === 0 || channelResult.rows.length === 0) {
      console.error('❌ No regions or channels found');
      return;
    }
    
    const region = regionResult.rows[0];
    const channel = channelResult.rows[0];
    console.log(`Region: ${region.region_name} (ID: ${region.region_id})`);
    console.log(`Channel: ${channel.channel_name} (ID: ${channel.channel_id})\n`);

    // Get time_ids for the date range
    const timeResult = await client.query(
      'SELECT time_id, date FROM Time_M WHERE date >= $1 AND date <= $2 ORDER BY date LIMIT 1',
      ['2025-01-01', '2025-01-15']
    );
    
    if (timeResult.rows.length === 0) {
      console.error('❌ No time records found for date range 2025-01-01 to 2025-01-15');
      console.log('Available date range in Time_M:');
      const dateRange = await client.query(
        'SELECT MIN(date) as min_date, MAX(date) as max_date FROM Time_M'
      );
      console.log(`  Min: ${dateRange.rows[0]?.min_date || 'N/A'}`);
      console.log(`  Max: ${dateRange.rows[0]?.max_date || 'N/A'}`);
      return;
    }
    
    const timeId = timeResult.rows[0].time_id;
    const testDate = timeResult.rows[0].date;
    console.log(`Test Date: ${testDate} (time_id: ${timeId})\n`);

    // Get all customers
    const customersResult = await client.query(
      'SELECT customer_id, customer_name FROM Customer_H ORDER BY customer_id'
    );
    
    console.log(`Found ${customersResult.rows.length} customers\n`);
    console.log('=' .repeat(80));
    console.log('\nTesting ML Estimation for each customer:\n');

    const testDiscountPct = 20.0;
    let successCount = 0;
    let nullBaseVolumeCount = 0;
    let nullEstimateCount = 0;
    const results: any[] = [];

    for (const customer of customersResult.rows) {
      try {
        // Try to get base volume from DuckDB view (or use a test value)
        // Since we're testing, we'll use a test base volume if not available
        let baseVolume: number | null = 1000; // Default test volume
        
        // Try to get actual base volume from Basevolume_allcombo_view if DuckDB is available
        // For now, using test values to verify ML estimation works
        const testBaseVolumes: { [key: number]: number } = {
          1: 1200,
          2: 1375,
          3: 1522,
          4: 806,
          5: 950,
          6: 598,
          7: 800,
          8: 1100,
          9: 750,
          10: 900
        };
        
        baseVolume = testBaseVolumes[customer.customer_id] || 1000;

        // Call ML estimation
        const estimate = await mlService.estimatePromoVolume({
          base_volume_snapshot: baseVolume,
          product_id: 1,
          customer_id: customer.customer_id,
          category_id: product.category_id,
          brand_id: product.brand_id,
          discount_pct: testDiscountPct
        });

        const status = estimate.promo_volume_estimate !== null ? '✓ SUCCESS' : '✗ NULL';
        const promoVolume = estimate.promo_volume_estimate || 0;
        const totalMultiplier = estimate.multipliers_used 
          ? (estimate.multipliers_used.category || 0) +
            (estimate.multipliers_used.brand || 0) +
            (estimate.multipliers_used.customer || 0) +
            (estimate.multipliers_used.product || 0) +
            (estimate.multipliers_used.discount || 0)
          : 0;

        if (estimate.promo_volume_estimate !== null) {
          successCount++;
        } else {
          nullEstimateCount++;
        }

        results.push({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          base_volume: baseVolume,
          promo_volume: promoVolume,
          total_multiplier: totalMultiplier,
          status,
          multipliers: estimate.multipliers_used
        });

        console.log(`${status} - ${customer.customer_name} (ID: ${customer.customer_id}):`);
        console.log(`  Base Volume: ${baseVolume}`);
        console.log(`  Estimated Promo Volume: ${promoVolume !== 0 ? promoVolume.toFixed(2) : 'NULL'}`);
        console.log(`  Total Multiplier: ${totalMultiplier.toFixed(4)}`);
        if (estimate.multipliers_used) {
          console.log(`  Multipliers - C: ${(estimate.multipliers_used.category || 0).toFixed(4)}, B: ${(estimate.multipliers_used.brand || 0).toFixed(4)}, Cu: ${(estimate.multipliers_used.customer || 0).toFixed(4)}, P: ${(estimate.multipliers_used.product || 0).toFixed(4)}, D: ${(estimate.multipliers_used.discount || 0).toFixed(4)}`);
        }
        console.log('');

      } catch (error: any) {
        console.error(`✗ ERROR - ${customer.customer_name} (ID: ${customer.customer_id}):`, error.message);
        results.push({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          status: '✗ ERROR',
          error: error.message
        });
        console.log('');
      }
    }

    // Summary
    console.log('='.repeat(80));
    console.log('\n=== SUMMARY ===\n');
    console.log(`Total Customers Tested: ${customersResult.rows.length}`);
    console.log(`Successful Estimations: ${successCount}`);
    console.log(`Null Estimates: ${nullEstimateCount}`);
    console.log(`Null Base Volumes: ${nullBaseVolumeCount}`);
    
    // Group by status
    const successful = results.filter(r => r.status === '✓ SUCCESS');
    const failed = results.filter(r => r.status !== '✓ SUCCESS');
    
    if (successful.length > 0) {
      console.log(`\n✓ Successful Estimations (${successful.length}):`);
      successful.slice(0, 5).forEach(r => {
        console.log(`  ${r.customer_name}: Base ${r.base_volume} → Promo ${r.promo_volume.toFixed(2)} (multiplier: ${r.total_multiplier.toFixed(4)})`);
      });
      if (successful.length > 5) {
        console.log(`  ... and ${successful.length - 5} more`);
      }
    }
    
    if (failed.length > 0) {
      console.log(`\n✗ Failed Estimations (${failed.length}):`);
      failed.forEach(r => {
        console.log(`  ${r.customer_name}: ${r.status}${r.error ? ` - ${r.error}` : ''}`);
      });
    }

    // Statistics
    if (successful.length > 0) {
      const avgBaseVolume = successful.reduce((sum, r) => sum + r.base_volume, 0) / successful.length;
      const avgPromoVolume = successful.reduce((sum, r) => sum + r.promo_volume, 0) / successful.length;
      const avgMultiplier = successful.reduce((sum, r) => sum + r.total_multiplier, 0) / successful.length;
      const minPromoVolume = Math.min(...successful.map(r => r.promo_volume));
      const maxPromoVolume = Math.max(...successful.map(r => r.promo_volume));
      
      console.log(`\n=== Statistics ===`);
      console.log(`Average Base Volume: ${avgBaseVolume.toFixed(2)}`);
      console.log(`Average Promo Volume: ${avgPromoVolume.toFixed(2)}`);
      console.log(`Average Total Multiplier: ${avgMultiplier.toFixed(4)}`);
      console.log(`Min Promo Volume: ${minPromoVolume.toFixed(2)}`);
      console.log(`Max Promo Volume: ${maxPromoVolume.toFixed(2)}`);
      console.log(`Average Lift: ${((avgPromoVolume / avgBaseVolume - 1) * 100).toFixed(2)}%`);
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
  testMLAllCustomers()
    .then(() => {
      console.log('\n✓ Test complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

export { testMLAllCustomers };
