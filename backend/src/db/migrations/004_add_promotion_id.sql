-- Migration to add Promotion_ID field to Fact_Promotions table
-- This field uniquely identifies a logical promotion (all records with the same Promotion_ID belong to the same promotion)

-- Add the Promotion_ID column
ALTER TABLE Fact_Promotions 
ADD COLUMN IF NOT EXISTS Promotion_ID INTEGER;

-- Create an index on Promotion_ID for faster lookups
CREATE INDEX IF NOT EXISTS idx_fact_promotions_promotion_id ON Fact_Promotions(Promotion_ID);

-- Backfill existing records: assign a unique Promotion_ID to each existing promotion group
-- We'll use the consecutive promo_id grouping logic to identify existing groups
DO $$
DECLARE
    rec RECORD;
    current_promotion_id INTEGER := 1;
    prev_discount NUMERIC := NULL;
    prev_promo_id INTEGER := NULL;
    prev_grp INTEGER := NULL;
BEGIN
    -- For each record ordered by promo_id, assign Promotion_ID based on discount_pct and consecutive promo_ids
    FOR rec IN 
        WITH ordered AS (
            SELECT 
                promo_id, 
                discount_pct, 
                promo_id - ROW_NUMBER() OVER (PARTITION BY discount_pct ORDER BY promo_id) as grp
            FROM Fact_Promotions
            ORDER BY discount_pct, promo_id
        )
        SELECT promo_id, discount_pct, grp
        FROM ordered
    LOOP
        -- If this is the first record or the group has changed (different discount or different group value), increment Promotion_ID
        IF prev_discount IS NULL OR 
           prev_discount != rec.discount_pct OR 
           (prev_grp IS NOT NULL AND prev_grp != rec.grp) THEN
            -- Start a new promotion if group changed
            IF prev_discount IS NOT NULL THEN
                current_promotion_id := current_promotion_id + 1;
            END IF;
        END IF;
        
        -- Assign the Promotion_ID
        UPDATE Fact_Promotions 
        SET Promotion_ID = current_promotion_id 
        WHERE promo_id = rec.promo_id;
        
        prev_discount := rec.discount_pct;
        prev_promo_id := rec.promo_id;
        prev_grp := rec.grp;
    END LOOP;
END $$;

-- Make Promotion_ID NOT NULL after backfilling (for new records)
-- Note: We keep it nullable for now to handle the migration gracefully
-- New code should always set this field
