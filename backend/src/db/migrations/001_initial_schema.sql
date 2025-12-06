-- Initial Schema for Planning Console

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY,
    category_name VARCHAR(255) NOT NULL,
    parent_category_id INTEGER REFERENCES categories(category_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
    brand_id INTEGER PRIMARY KEY,
    brand_name VARCHAR(255) NOT NULL,
    parent_brand_id INTEGER REFERENCES brands(brand_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    channel_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Regions
CREATE TABLE IF NOT EXISTS regions (
    region_id INTEGER PRIMARY KEY,
    region_name VARCHAR(255) NOT NULL,
    parent_region_id INTEGER REFERENCES regions(region_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    parent_customer_id INTEGER REFERENCES customers(customer_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    product_id INTEGER PRIMARY KEY,
    barcode VARCHAR(50) UNIQUE,
    sku_name VARCHAR(255) NOT NULL,
    description TEXT,
    net_weight DECIMAL(10, 2),
    pack_size VARCHAR(50),
    category_id INTEGER REFERENCES categories(category_id),
    brand_id INTEGER REFERENCES brands(brand_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Time Dimension
CREATE TABLE IF NOT EXISTS time (
    time_id INTEGER PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    day INTEGER NOT NULL,
    week INTEGER NOT NULL,
    month INTEGER NOT NULL,
    quarter INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prices
CREATE TABLE IF NOT EXISTS prices (
    price_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    time_id INTEGER REFERENCES time(time_id),
    list_price DECIMAL(10, 2) NOT NULL,
    customer_price DECIMAL(10, 2) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    promo_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, customer_id, time_id)
);

-- Costs
CREATE TABLE IF NOT EXISTS costs (
    cost_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    time_id INTEGER REFERENCES time(time_id),
    cogs DECIMAL(10, 2) NOT NULL,
    logs DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, customer_id, time_id)
);

-- Baseline Volumes
CREATE TABLE IF NOT EXISTS baseline_volumes (
    volume_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    time_id INTEGER REFERENCES time(time_id),
    volume DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, customer_id, time_id)
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
    promotion_id SERIAL PRIMARY KEY,
    promotion_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft',
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promotion Items
CREATE TABLE IF NOT EXISTS promotion_items (
    promotion_item_id SERIAL PRIMARY KEY,
    promotion_id INTEGER REFERENCES promotions(promotion_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id),
    customer_id INTEGER REFERENCES customers(customer_id),
    region_id INTEGER REFERENCES regions(region_id),
    channel_id INTEGER REFERENCES channels(channel_id),
    discount_type VARCHAR(50) NOT NULL, -- 'percentage', 'fixed', 'bogo'
    discount_value DECIMAL(10, 2),
    estimated_volume DECIMAL(15, 2),
    ml_model_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ML Model Configurations
CREATE TABLE IF NOT EXISTS ml_model_configs (
    config_id SERIAL PRIMARY KEY,
    model_name VARCHAR(255) NOT NULL UNIQUE,
    model_type VARCHAR(100) NOT NULL, -- 'regression', 'time_series', 'ensemble'
    config_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hierarchy Configurations
CREATE TABLE IF NOT EXISTS hierarchy_configs (
    config_id SERIAL PRIMARY KEY,
    config_name VARCHAR(255) NOT NULL UNIQUE,
    node_type VARCHAR(100) NOT NULL,
    relation_type VARCHAR(100) NOT NULL,
    source_table VARCHAR(100) NOT NULL,
    source_id_column VARCHAR(100) NOT NULL,
    source_parent_column VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_prices_product_customer_time ON prices(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_costs_product_customer_time ON costs(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_volumes_product_customer_time ON baseline_volumes(product_id, customer_id, time_id);
CREATE INDEX IF NOT EXISTS idx_promotion_items_promotion ON promotion_items(promotion_id);
CREATE INDEX IF NOT EXISTS idx_time_date ON time(date);
CREATE INDEX IF NOT EXISTS idx_time_year_month ON time(year, month);

