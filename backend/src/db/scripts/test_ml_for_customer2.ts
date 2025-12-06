import { mlService } from '../../services/mlService';

async function testMLForCustomer2() {
  try {
    console.log('=== Testing ML Estimation for Customer ID 2 (Tesco) ===\n');
    
    // Test parameters from the Tesco records
    const testParams = {
      base_volume_snapshot: 1375.59,
      product_id: 1,
      customer_id: 2,
      category_id: 3,
      brand_id: 3,
      discount_pct: 28.0
    };
    
    console.log('Test parameters:');
    console.log(JSON.stringify(testParams, null, 2));
    console.log('\n');
    
    // Check if active model exists
    const activeModel = await mlService.getActiveModel();
    if (!activeModel) {
      console.log('❌ No active ML model found');
      return;
    }
    console.log(`✓ Active model: ${activeModel.model_name} v${activeModel.model_version} (ID: ${activeModel.model_id})\n`);
    
    // Try to get coefficients
    console.log('Fetching coefficients:');
    const categoryCoeff = await mlService.getCoefficient(activeModel.model_id, 'category', 3);
    console.log(`  Category (3): ${categoryCoeff}`);
    
    const brandCoeff = await mlService.getCoefficient(activeModel.model_id, 'brand', 3);
    console.log(`  Brand (3): ${brandCoeff}`);
    
    const customerCoeff = await mlService.getCoefficient(activeModel.model_id, 'customer', 2);
    console.log(`  Customer (2): ${customerCoeff}`);
    
    const productCoeff = await mlService.getCoefficient(activeModel.model_id, 'product', 1);
    console.log(`  Product (1): ${productCoeff}`);
    
    const discountCoeff = await mlService.getCoefficient(activeModel.model_id, 'discount_tier', null, 28.0);
    console.log(`  Discount tier (28%): ${discountCoeff}`);
    
    console.log('\n');
    
    // Try to estimate volume
    console.log('Calling estimatePromoVolume:');
    const estimate = await mlService.estimatePromoVolume(testParams);
    
    console.log('Result:');
    console.log(JSON.stringify(estimate, null, 2));
    
    if (estimate.promo_volume_estimate === null) {
      console.log('\n❌ ML estimation returned null');
      console.log('This explains why Tesco records don\'t have promo volumes');
    } else {
      console.log(`\n✓ ML estimation successful: ${estimate.promo_volume_estimate}`);
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

if (require.main === module) {
  testMLForCustomer2()
    .then(() => {
      console.log('\n✓ Test complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
