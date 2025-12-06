import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../../utils/logger';

dotenv.config();

// Seed files are in db/Seed at project root
const projectRoot = join(__dirname, '../../../..');
const seedDir = join(projectRoot, 'db/Seed');

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
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: 'pc_postgres_db',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });

  try {
    logger.info('Starting seed process for pc_postgres_db...');

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

    // Seed Category_H
    logger.info('Seeding Category_H...');
    for (const cat of categories) {
      await pool.query(
        `INSERT INTO Category_H (category_id, category_name, parent_category_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (category_id) DO UPDATE SET category_name = EXCLUDED.category_name, parent_category_id = EXCLUDED.parent_category_id`,
        [cat.category_id, cat.category_name, cat.parent_category_id || null]
      );
    }

    // Seed Brand_H
    logger.info('Seeding Brand_H...');
    for (const brand of brands) {
      await pool.query(
        `INSERT INTO Brand_H (brand_id, brand_name, parent_brand_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (brand_id) DO UPDATE SET brand_name = EXCLUDED.brand_name, parent_brand_id = EXCLUDED.parent_brand_id`,
        [brand.brand_id, brand.brand_name, brand.parent_brand_id || null]
      );
    }

    // Seed Channel_M
    logger.info('Seeding Channel_M...');
    for (const channel of channels) {
      await pool.query(
        `INSERT INTO Channel_M (channel_id, channel_name)
         VALUES ($1, $2)
         ON CONFLICT (channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name`,
        [channel.channel_id, channel.channel_name]
      );
    }

    // Seed Region_H
    logger.info('Seeding Region_H...');
    for (const region of regions) {
      await pool.query(
        `INSERT INTO Region_H (region_id, region_name, parent_region_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (region_id) DO UPDATE SET region_name = EXCLUDED.region_name, parent_region_id = EXCLUDED.parent_region_id`,
        [region.region_id, region.region_name, region.parent_region_id || null]
      );
    }

    // Seed Customer_H
    logger.info('Seeding Customer_H...');
    for (const customer of customers) {
      await pool.query(
        `INSERT INTO Customer_H (customer_id, customer_name, parent_customer_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (customer_id) DO UPDATE SET customer_name = EXCLUDED.customer_name, parent_customer_id = EXCLUDED.parent_customer_id`,
        [customer.customer_id, customer.customer_name, customer.parent_customer_id || null]
      );
    }

    // Seed Product_M
    logger.info('Seeding Product_M...');
    for (const product of products) {
      await pool.query(
        `INSERT INTO Product_M (product_id, barcode, sku_name, description, net_weight, pack_size, category_id, brand_id)
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

    // Seed Time_M
    logger.info('Seeding Time_M...');
    for (const t of time) {
      await pool.query(
        `INSERT INTO Time_M (time_id, date, day, week, month, quarter, year)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (time_id) DO UPDATE SET date = EXCLUDED.date, day = EXCLUDED.day, week = EXCLUDED.week, month = EXCLUDED.month, quarter = EXCLUDED.quarter, year = EXCLUDED.year`,
        [t.time_id, t.date, t.day, t.week, t.month, t.quarter, t.year]
      );
    }

    // Seed Fact_Prices
    logger.info('Seeding Fact_Prices...');
    for (const price of prices) {
      await pool.query(
        `INSERT INTO Fact_Prices (product_id, customer_id, time_id, list_price, customer_price, base_price, promo_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (product_id, customer_id, time_id) DO UPDATE SET list_price = EXCLUDED.list_price, customer_price = EXCLUDED.customer_price, base_price = EXCLUDED.base_price, promo_price = EXCLUDED.promo_price`,
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

    // Seed Fact_Costs
    logger.info('Seeding Fact_Costs...');
    for (const cost of costs) {
      await pool.query(
        `INSERT INTO Fact_Costs (product_id, customer_id, time_id, cogs, logs)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, customer_id, time_id) DO UPDATE SET cogs = EXCLUDED.cogs, logs = EXCLUDED.logs`,
        [cost.product_id, cost.customer_id, cost.time_id, cost.cogs, cost.logs]
      );
    }

    // Seed Fact_Volumes
    logger.info('Seeding Fact_Volumes...');
    for (const volume of baselineVolumes) {
      await pool.query(
        `INSERT INTO Fact_Volumes (product_id, customer_id, time_id, volume)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, customer_id, time_id) DO UPDATE SET volume = EXCLUDED.volume`,
        [volume.product_id, volume.customer_id, volume.time_id, volume.volume]
      );
    }

    // Seed Fact_Base_Volume
    logger.info('Seeding Fact_Base_Volume...');
    for (const volume of baselineVolumes) {
      await pool.query(
        `INSERT INTO Fact_Base_Volume (product_id, customer_id, time_id, volume)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, customer_id, time_id) DO UPDATE SET volume = EXCLUDED.volume`,
        [volume.product_id, volume.customer_id, volume.time_id, volume.volume]
      );
    }

    logger.info('Seed process completed successfully');
    await pool.end();
  } catch (error) {
    logger.error('Seed process failed', error);
    await pool.end();
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

