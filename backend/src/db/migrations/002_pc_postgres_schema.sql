-- Create database pc_postgres_db (run this manually or via psql)
-- CREATE DATABASE pc_postgres_db;

-- CATEGORY HIERARCHY
CREATE TABLE IF NOT EXISTS Category_H (
    category_id INTEGER PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id INTEGER REFERENCES Category_H(category_id)
);

-- BRAND HIERARCHY
CREATE TABLE IF NOT EXISTS Brand_H (
    brand_id INTEGER PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL,
    parent_brand_id INTEGER REFERENCES Brand_H(brand_id)
);

-- REGION HIERARCHY
CREATE TABLE IF NOT EXISTS Region_H (
    region_id INTEGER PRIMARY KEY,
    region_name VARCHAR(100) NOT NULL,
    parent_region_id INTEGER REFERENCES Region_H(region_id)
);

-- CUSTOMER HIERARCHY
CREATE TABLE IF NOT EXISTS Customer_H (
    customer_id INTEGER PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    parent_customer_id INTEGER REFERENCES Customer_H(customer_id)
);

-- CHANNEL MASTER
CREATE TABLE IF NOT EXISTS Channel_M (
    channel_id INTEGER PRIMARY KEY,
    channel_name VARCHAR(100) NOT NULL
);

-- PRODUCT MASTER
CREATE TABLE IF NOT EXISTS Product_M (
    product_id INTEGER PRIMARY KEY,
    barcode VARCHAR(50),
    sku_name VARCHAR(200) NOT NULL,
    description TEXT,
    net_weight NUMERIC(10,2),
    pack_size VARCHAR(50),
    category_id INT REFERENCES Category_H(category_id),
    brand_id INT REFERENCES Brand_H(brand_id)
);

-- TIME DIMENSION
CREATE TABLE IF NOT EXISTS Time_M (
    time_id INTEGER PRIMARY KEY,
    date DATE NOT NULL,
    day INT NOT NULL,
    week INT NOT NULL,
    month INT NOT NULL,
    quarter INT NOT NULL,
    year INT NOT NULL
);

-- FACT COSTS
CREATE TABLE IF NOT EXISTS Fact_Costs (
    cost_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    cogs NUMERIC(10,2),
    logs NUMERIC(10,2),
    UNIQUE(product_id, customer_id, time_id)
);

-- FACT PRICES (List, Customer, Base, Promo)
CREATE TABLE IF NOT EXISTS Fact_Prices (
    price_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    list_price NUMERIC(10,2),
    customer_price NUMERIC(10,2),
    base_price NUMERIC(10,2),
    promo_price NUMERIC(10,2),
    UNIQUE(product_id, customer_id, time_id)
);

-- FACT PROMOTIONS (INCLUDING COST SNAPSHOTS)
CREATE TABLE IF NOT EXISTS Fact_Promotions (
    promo_id SERIAL PRIMARY KEY,

    -- PROMOTION IDENTIFIER: All records with the same Promotion_ID belong to the same logical promotion
    Promotion_ID INTEGER,

    -- SCOPE
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    region_id INT REFERENCES Region_H(region_id),
    channel_id INT REFERENCES Channel_M(channel_id),
    time_id INT REFERENCES Time_M(time_id),

    -- PROMO DETAILS
    discount_pct NUMERIC(5,2),
    promo_price_calculated NUMERIC(10,2),

    -- COST SNAPSHOTS (Captured at promo creation time)
    cogs_snapshot NUMERIC(10,2),
    logs_snapshot NUMERIC(10,2),

    -- OPTIONAL: AGGREGATED PNL SNAPSHOTS
    base_price_snapshot NUMERIC(10,2),
    base_volume_snapshot NUMERIC(10,2),
    promo_volume_estimate NUMERIC(10,2),
    incremental_volume NUMERIC(10,2),
    incremental_revenue NUMERIC(10,2),
    incremental_margin NUMERIC(10,2)
);

-- FACT VOLUMES
CREATE TABLE IF NOT EXISTS Fact_Volumes (
    volume_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    volume NUMERIC(10,2),
    UNIQUE(product_id, customer_id, time_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_category ON Product_M(category_id);
CREATE INDEX IF NOT EXISTS idx_product_brand ON Product_M(brand_id);
CREATE INDEX IF NOT EXISTS idx_fact_costs_product_customer_time ON Fact_Costs(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_fact_prices_product_customer_time ON Fact_Prices(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_fact_volumes_product_customer_time ON Fact_Volumes(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_time_date ON Time_M(date);
CREATE INDEX IF NOT EXISTS idx_time_year_month ON Time_M(year, month);
CREATE INDEX IF NOT EXISTS idx_fact_promotions_promotion_id ON Fact_Promotions(Promotion_ID);

