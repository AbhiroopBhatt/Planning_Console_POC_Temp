-- ML Model Configuration Table
CREATE TABLE IF NOT EXISTS ML_Model_Config (
    model_id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    model_description TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    config_json JSONB,
    UNIQUE(model_name, model_version)
);

-- ML Model Coefficients Table
CREATE TABLE IF NOT EXISTS ML_Model_Coefficients (
    coefficient_id SERIAL PRIMARY KEY,
    model_id INT REFERENCES ML_Model_Config(model_id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    coefficient_value NUMERIC(10,4) NOT NULL,
    discount_min_pct NUMERIC(5,2),
    discount_max_pct NUMERIC(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(model_id, entity_type, entity_id, discount_min_pct, discount_max_pct)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ml_model_config_active ON ML_Model_Config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ml_model_coefficients_model ON ML_Model_Coefficients(model_id);
CREATE INDEX IF NOT EXISTS idx_ml_model_coefficients_entity ON ML_Model_Coefficients(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ml_model_coefficients_discount ON ML_Model_Coefficients(entity_type, discount_min_pct, discount_max_pct) WHERE entity_type = 'discount_tier';
