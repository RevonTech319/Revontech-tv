-- Migration to add category column to channels table
ALTER TABLE channels ADD COLUMN category TEXT DEFAULT 'General';

-- Update existing channels with some default categories (optional but helpful)
UPDATE channels SET category = 'Sports' WHERE name ILIKE '%sport%';
UPDATE channels SET category = 'News' WHERE name ILIKE '%news%';
UPDATE channels SET category = 'Movies' WHERE name ILIKE '%movie%';
UPDATE channels SET category = 'Music' WHERE name ILIKE '%music%';
