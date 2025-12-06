-- CATEGORY HIERARCHY
CREATE TABLE Category_H (
    category_id SERIAL PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id INTEGER REFERENCES Category_H(category_id)
);

-- BRAND HIERARCHY
CREATE TABLE Brand_H (
    brand_id SERIAL PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL,
    parent_brand_id INTEGER REFERENCES Brand_H(brand_id)
);

-- REGION HIERARCHY
CREATE TABLE Region_H (
    region_id SERIAL PRIMARY KEY,
    region_name VARCHAR(100) NOT NULL,
    parent_region_id INTEGER REFERENCES Region_H(region_id)
);

-- CUSTOMER HIERARCHY
CREATE TABLE Customer_H (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    parent_customer_id INTEGER REFERENCES Customer_H(customer_id)
);

-- CHANNEL MASTER
CREATE TABLE Channel_M (
    channel_id SERIAL PRIMARY KEY,
    channel_name VARCHAR(100) NOT NULL
);

-- PRODUCT MASTER
CREATE TABLE Product_M (
    product_id SERIAL PRIMARY KEY,
    barcode VARCHAR(50),
    sku_name VARCHAR(200) NOT NULL,
    description TEXT,
    net_weight NUMERIC(10,2),
    pack_size VARCHAR(50),
    category_id INT REFERENCES Category_H(category_id),
    brand_id INT REFERENCES Brand_H(brand_id)
);

-- TIME DIMENSION
CREATE TABLE Time_M (
    time_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    day INT NOT NULL,
    week INT NOT NULL,
    month INT NOT NULL,
    quarter INT NOT NULL,
    year INT NOT NULL
);

-- FACT COSTS
CREATE TABLE Fact_Costs (
    cost_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    cogs NUMERIC(10,2),
    logs NUMERIC(10,2)
);

-- FACT PRICES (List, Customer, Base, Promo)
CREATE TABLE Fact_Prices (
    price_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    list_price NUMERIC(10,2),
    customer_price NUMERIC(10,2),
    base_price NUMERIC(10,2),
    promo_price NUMERIC(10,2)
);

-- FACT PROMOTIONS (INCLUDING COST SNAPSHOTS)
CREATE TABLE Fact_Promotions (
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
CREATE TABLE Fact_Volumes (
    volume_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    volume NUMERIC(10,2)
);

-- FACT BASE VOLUME (Baseline volumes for product-customer-time combinations)
CREATE TABLE Fact_Base_Volume (
    base_volume_id SERIAL PRIMARY KEY,
    product_id INT REFERENCES Product_M(product_id),
    customer_id INT REFERENCES Customer_H(customer_id),
    time_id INT REFERENCES Time_M(time_id),
    volume NUMERIC(10,2) NOT NULL,
    UNIQUE(product_id, customer_id, time_id)
);
