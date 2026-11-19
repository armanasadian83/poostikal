-- Preserve stable pagination (id ascending for equal prices in either direction).
CREATE INDEX products_live_price_asc ON products(price ASC,id ASC) WHERE deleted_at IS NULL AND status<>'draft';
CREATE INDEX products_live_price_desc ON products(price DESC,id ASC) WHERE deleted_at IS NULL AND status<>'draft';
