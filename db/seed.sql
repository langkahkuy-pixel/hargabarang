-- Sample catalog for development only.
INSERT INTO categories (id, name) VALUES
  ('7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Bahan pokok'),
  ('7792f693-d4d5-44e4-a7ae-4b57e7a98a02', 'Makanan instan');

INSERT INTO products (id, category_id, name, brand, variant, unit, sku, aliases, sale_price, cost_price, stock_qty) VALUES
  ('139e0fb4-479f-4fae-a290-561f8176c001', '7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Minyak Goreng', 'Bimoli', '1 liter', 'pouch', 'MYK-001', '["minyak bimoli"]', 21500, NULL, 24),
  ('139e0fb4-479f-4fae-a290-561f8176c002', '7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Minyak Goreng', 'Bimoli', '2 liter', 'pouch', 'MYK-002', '["minyak bimoli"]', 41000, 38000, 16),
  ('139e0fb4-479f-4fae-a290-561f8176c003', '7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Gula Pasir', 'Gulaku', '1 kg', 'bungkus', 'GLA-001', '["gula putih"]', 18500, NULL, 32),
  ('139e0fb4-479f-4fae-a290-561f8176c004', '7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Beras', 'Pandan Wangi', '5 kg', 'karung', 'BRS-005', '["beras pandan"]', 78000, NULL, 10),
  ('139e0fb4-479f-4fae-a290-561f8176c005', '7792f693-d4d5-44e4-a7ae-4b57e7a98a01', 'Telur Ayam', '', '1 kg', 'kg', 'TLR-001', '["telur negeri"]', 29000, NULL, 12),
  ('139e0fb4-479f-4fae-a290-561f8176c006', '7792f693-d4d5-44e4-a7ae-4b57e7a98a02', 'Mi Goreng', 'Indomie', '85 g', 'bungkus', 'MIE-085', '["indomie goreng", "mie goreng"]', 3500, NULL, 48);
