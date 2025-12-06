import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { query } from '../postgres';
import { logger } from '../../utils/logger';

// Note: Install csv-parse: npm install csv-parse

// Seed files are in db/Seed at project root
// When running with tsx, __dirname is backend/src/db/seed
// Use path.resolve to get absolute path from project root
const seedDir = join(__dirname, '../../../..', 'db', 'Seed');

interface SeedData {
  [key: string]: any[];
}

const loadCSV = (filename: string): any[] => {
  const filePath = join(seedDir, filename);
  const content = readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    cast: true,
  });
};

const seedData = async () => {
  try {
    logger.info('Starting seed process...');

    // Load all CSV files
    const categories = loadCSV('categories.csv');
    const brands = loadCSV('brands.csv');
    const channels = loadCSV('channels.csv');
    const regions = loadCSV('regions.csv');
    const customers = loadCSV('customers.csv');
    const products = loadCSV('products.csv');
    const time = loadCSV('time.csv');
    const prices = loadCSV('prices.csv');
    const costs = loadCSV('costs.csv');
    const baselineVolumes = loadCSV('baseline_volumes.csv');

    // Seed categories
    logger.info('Seeding categories...');
    for (const cat of categories) {
      await query(
        `INSERT INTO categories (category_id, category_name, parent_category_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (category_id) DO UPDATE SET category_name = EXCLUDED.category_name, parent_category_id = EXCLUDED.parent_category_id`,
        [cat.category_id, cat.category_name, cat.parent_category_id || null]
      );
    }

    // Seed brands
    logger.info('Seeding brands...');
    for (const brand of brands) {
      await query(
        `INSERT INTO brands (brand_id, brand_name, parent_brand_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (brand_id) DO UPDATE SET brand_name = EXCLUDED.brand_name, parent_brand_id = EXCLUDED.parent_brand_id`,
        [brand.brand_id, brand.brand_name, brand.parent_brand_id || null]
      );
    }

    // Seed channels
    logger.info('Seeding channels...');
    for (const channel of channels) {
      await query(
        `INSERT INTO channels (channel_id, channel_name)
         VALUES ($1, $2)
         ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name`,
        [channel.channel_id, channel.channel_name]
      );
    }

    // Seed regions
    logger.info('Seeding regions...');
    for (const region of regions) {
      await query(
        `INSERT INTO regions (region_id, region_name, parent_region_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (region_id) DO UPDATE SET region_name = EXCLUDED.region_name, parent_region_id = EXCLUDED.parent_region_id`,
        [region.region_id, region.region_name, region.parent_region_id || null]
      );
    }

    // Seed customers
    logger.info('Seeding customers...');
    for (const customer of customers) {
      await query(
        `INSERT INTO customers (customer_id, customer_name, parent_customer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (customer_id) DO UPDATE SET customer_name = EXCLUDED.customer_name, parent_customer_id = EXCLUDED.parent_customer_id`,
        [customer.customer_id, customer.customer_name, customer.parent_customer_id || null]
      );
    }

    // Seed products
    logger.info('Seeding products...');
    for (const product of products) {
      await query(
        `INSERT INTO products (product_id, barcode, sku_name, description, net_weight, pack_size, category_id, brand_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (product_id) DO UPDATE SET barcode = EXCLUDED.barcode, sku_name = EXCLUDED.sku_name, description = EXCLUDED.description, net_weight = EXCLUDED.net_weight, pack_size = EXCLUDED.pack_size, category_id = EXCLUDED.category_id, brand_id = EXCLUDED.brand_id`,
        [
          product.product_id,
          product.barcode,
          product.sku_name,
          product.description,
          product.net_weight,
          product.pack_size,
          product.category_id,
          product.brand_id,
        ]
      );
    }

    // Seed time
    logger.info('Seeding time dimension...');
    for (const t of time) {
      await query(
        `INSERT INTO time (time_id, date, day, week, month, quarter, year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (time_id) DO UPDATE SET date = EXCLUDED.date, day = EXCLUDED.day, week = EXCLUDED.week, month = EXCLUDED.month, quarter = EXCLUDED.quarter, year = EXCLUDED.year`,
        [t.time_id, t.date, t.day, t.week, t.month, t.quarter, t.year]
      );
    }

    // Seed prices
    logger.info('Seeding prices...');
    for (const price of prices) {
      await query(
        `INSERT INTO prices (product_id, customer_id, time_id, list_price, customer_price, base_price, promo_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (product_id, customer_id, time_id) DO NOTHING`,
        [
          price.product_id,
          price.customer_id,
          price.time_id,
          price.list_price,
          price.customer_price,
          price.base_price,
          price.promo_price,
        ]
      );
    }

    // Seed costs
    logger.info('Seeding costs...');
    for (const cost of costs) {
      await query(
        `INSERT INTO costs (product_id, customer_id, time_id, cogs, logs)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, customer_id, time_id) DO NOTHING`,
        [cost.product_id, cost.customer_id, cost.time_id, cost.cogs, cost.logs]
      );
    }

    // Seed baseline volumes
    logger.info('Seeding baseline volumes...');
    for (const volume of baselineVolumes) {
      await query(
        `INSERT INTO baseline_volumes (product_id, customer_id, time_id, volume)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, customer_id, time_id) DO NOTHING`,
        [volume.product_id, volume.customer_id, volume.time_id, volume.volume]
      );
    }

    logger.info('Seed process completed successfully');
  } catch (error) {
    logger.error('Seed process failed', error);
    throw error;
  }
};

if (require.main === module) {
  seedData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedData };

