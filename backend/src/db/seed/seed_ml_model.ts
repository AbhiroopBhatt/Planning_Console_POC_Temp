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

/**
 * Generate random number within range
 */
function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Round to 4 decimal places
 */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

async function seedMLModel() {
  const client = await pcDbPool.connect();
  try {
    // Check if tables exist first
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ml_model_config'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('ERROR: ML_Model_Config table does not exist. Please run the migration first:');
      console.error('  cd backend && npm run migrate');
      throw new Error('ML_Model_Config table does not exist. Run migrations first.');
    }

    await client.query('BEGIN');

    // Check if model already exists
    const existingModel = await client.query(`
      SELECT model_id FROM ML_Model_Config 
      WHERE model_name = 'VolumeMultiplierModel' AND model_version = '1.0'
    `);

    let modelId: number;
    if (existingModel.rows.length > 0) {
      modelId = existingModel.rows[0].model_id;
      console.log(`ML Model already exists with ID: ${modelId}. Updating...`);
      
      // Update existing model to be active
      await client.query(`
        UPDATE ML_Model_Config 
        SET is_active = true,
            model_description = 'Initial multiplier-based volume estimation model using category, brand, customer, product, and discount tier coefficients. Coefficients are randomly initialized.'
        WHERE model_id = $1
      `, [modelId]);
      
      // Delete existing coefficients to reseed
      await client.query(`
        DELETE FROM ML_Model_Coefficients WHERE model_id = $1
      `, [modelId]);
      console.log('Cleared existing coefficients for reseeding');
    } else {
      // Create model configuration
      const modelResult = await client.query(`
        INSERT INTO ML_Model_Config (
          model_name, model_version, model_type, model_description, is_active, created_by
        ) VALUES (
          'VolumeMultiplierModel', '1.0', 'multiplier_based',
          'Initial multiplier-based volume estimation model using category, brand, customer, product, and discount tier coefficients. Coefficients are randomly initialized.',
          true, 'system'
        ) RETURNING model_id
      `);

      modelId = modelResult.rows[0].model_id;
      console.log(`Created ML Model Config with ID: ${modelId}`);
    }

    // Seed category coefficients (range: -0.2 to +0.3)
    const categoryResult = await client.query('SELECT category_id FROM Category_H');
    for (const row of categoryResult.rows) {
      const coefficient = round4(randomBetween(-0.2, 0.3));
      await client.query(`
        INSERT INTO ML_Model_Coefficients (model_id, entity_type, entity_id, coefficient_value)
        VALUES ($1, 'category', $2, $3)
        ON CONFLICT (model_id, entity_type, entity_id, discount_min_pct, discount_max_pct) DO NOTHING
      `, [modelId, row.category_id, coefficient]);
    }
    console.log(`Seeded ${categoryResult.rows.length} category coefficients`);

    // Seed brand coefficients (range: -0.15 to +0.25)
    const brandResult = await client.query('SELECT brand_id FROM Brand_H');
    for (const row of brandResult.rows) {
      const coefficient = round4(randomBetween(-0.15, 0.25));
      await client.query(`
        INSERT INTO ML_Model_Coefficients (model_id, entity_type, entity_id, coefficient_value)
        VALUES ($1, 'brand', $2, $3)
        ON CONFLICT (model_id, entity_type, entity_id, discount_min_pct, discount_max_pct) DO NOTHING
      `, [modelId, row.brand_id, coefficient]);
    }
    console.log(`Seeded ${brandResult.rows.length} brand coefficients`);

    // Seed customer coefficients (range: -0.1 to +0.2)
    const customerResult = await client.query('SELECT customer_id FROM Customer_H');
    for (const row of customerResult.rows) {
      const coefficient = round4(randomBetween(-0.1, 0.2));
      await client.query(`
        INSERT INTO ML_Model_Coefficients (model_id, entity_type, entity_id, coefficient_value)
        VALUES ($1, 'customer', $2, $3)
        ON CONFLICT (model_id, entity_type, entity_id, discount_min_pct, discount_max_pct) DO NOTHING
      `, [modelId, row.customer_id, coefficient]);
    }
    console.log(`Seeded ${customerResult.rows.length} customer coefficients`);

    // Seed product coefficients (range: -0.05 to +0.15)
    const productResult = await client.query('SELECT product_id FROM Product_M');
    for (const row of productResult.rows) {
      const coefficient = round4(randomBetween(-0.05, 0.15));
      await client.query(`
        INSERT INTO ML_Model_Coefficients (model_id, entity_type, entity_id, coefficient_value)
        VALUES ($1, 'product', $2, $3)
        ON CONFLICT (model_id, entity_type, entity_id, discount_min_pct, discount_max_pct) DO NOTHING
      `, [modelId, row.product_id, coefficient]);
    }
    console.log(`Seeded ${productResult.rows.length} product coefficients`);

    // Seed discount tier coefficients
    const discountTiers = [
      { min: 0, max: 10, range: [0.05, 0.15] },
      { min: 11, max: 25, range: [0.15, 0.30] },
      { min: 26, max: 50, range: [0.30, 0.50] },
      { min: 51, max: 99.99, range: [0.50, 0.75] }
    ];

    for (const tier of discountTiers) {
      const coefficient = round4(randomBetween(tier.range[0], tier.range[1]));
      await client.query(`
        INSERT INTO ML_Model_Coefficients (
          model_id, entity_type, entity_id, coefficient_value, discount_min_pct, discount_max_pct
        )
        VALUES ($1, 'discount_tier', NULL, $2, $3, $4)
        ON CONFLICT (model_id, entity_type, entity_id, discount_min_pct, discount_max_pct) DO NOTHING
      `, [modelId, coefficient, tier.min, tier.max]);
    }
    console.log(`Seeded ${discountTiers.length} discount tier coefficients`);

    await client.query('COMMIT');
    console.log('Successfully seeded ML model v1.0 with random coefficients');

  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {}); // Ignore rollback errors
    console.error('Error seeding ML model:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  } finally {
    client.release();
    await pcDbPool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedMLModel()
    .then(() => {
      console.log('Seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedMLModel };
