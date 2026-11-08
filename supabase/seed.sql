-- Example catalog for local reset. User membership is assigned separately by an administrator.
insert into public.stores (id, name) values ('7d292361-2eb3-447b-93a8-26be9aa88880', 'Toko Sembako Makmur');

insert into public.products (id, store_id, name, brand, variant, unit, sku, aliases, sale_price, stock_qty)
select item.id::uuid, store.id, item.name, item.brand, item.variant, item.unit, item.sku, item.aliases, item.sale, item.stock
from public.stores store
cross join (values
  ('139e0fb4-479f-4fae-a290-561f8176c001', 'Minyak Goreng', 'Bimoli', '1 liter', 'pouch', 'MYK-001', array['minyak bimoli'], 21500, 24),
  ('139e0fb4-479f-4fae-a290-561f8176c002', 'Minyak Goreng', 'Bimoli', '2 liter', 'pouch', 'MYK-002', array['minyak bimoli'], 41000, 16),
  ('139e0fb4-479f-4fae-a290-561f8176c003', 'Gula Pasir', 'Gulaku', '1 kg', 'bungkus', 'GLA-001', array['gula putih'], 18500, 32),
  ('139e0fb4-479f-4fae-a290-561f8176c004', 'Beras', 'Pandan Wangi', '5 kg', 'karung', 'BRS-005', array['beras pandan'], 78000, 10),
  ('139e0fb4-479f-4fae-a290-561f8176c005', 'Telur Ayam', '', '1 kg', 'kg', 'TLR-001', array['telur negeri'], 29000, 12),
  ('139e0fb4-479f-4fae-a290-561f8176c006', 'Mi Goreng', 'Indomie', '85 g', 'bungkus', 'MIE-085', array['indomie goreng', 'mie goreng'], 3500, 48)
) as item(id, name, brand, variant, unit, sku, aliases, sale, stock)
where store.id = '7d292361-2eb3-447b-93a8-26be9aa88880';

insert into public.product_costs (product_id, store_id, cost_price)
values ('139e0fb4-479f-4fae-a290-561f8176c002', '7d292361-2eb3-447b-93a8-26be9aa88880', 38000);
