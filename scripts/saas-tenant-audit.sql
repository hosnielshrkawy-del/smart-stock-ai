-- Run before validating the NOT VALID tenant-aware foreign keys in migration 0003.
-- Every query should return zero rows. Run with a privileged migration/admin role.

-- Products referencing another organization's category, unit, supplier, or parent.
select 'products.category' as relation, p.id as row_id, p.org_id, p.category_id as related_id
from products p join categories r on r.id = p.category_id where p.org_id <> r.org_id
union all
select 'products.unit', p.id, p.org_id, p.base_unit_id
from products p join units r on r.id = p.base_unit_id where p.org_id <> r.org_id
union all
select 'products.supplier', p.id, p.org_id, p.supplier_id
from products p join suppliers r on r.id = p.supplier_id where p.org_id <> r.org_id
union all
select 'products.parent', p.id, p.org_id, p.parent_id
from products p join products r on r.id = p.parent_id where p.org_id <> r.org_id;

-- Documents and lines must refer only to records owned by the same organization.
select 'documents.warehouse' as relation, d.id as row_id, d.org_id, w.id as related_id
from documents d join warehouses w on w.id = d.warehouse_id where d.org_id <> w.org_id
union all
select 'documents.warehouse_to', d.id, d.org_id, w.id
from documents d join warehouses w on w.id = d.warehouse_to_id where d.org_id <> w.org_id
union all
select 'document_lines.document', l.id, l.org_id, d.id
from document_lines l join documents d on d.id = l.document_id where l.org_id <> d.org_id
union all
select 'document_lines.product', l.id, l.org_id, p.id
from document_lines l join products p on p.id = l.product_id where l.org_id <> p.org_id
union all
select 'document_lines.location', l.id, l.org_id, x.id
from document_lines l join locations x on x.id = l.location_id where l.org_id <> x.org_id;

-- Orders and their partners, warehouses, and line items.
select 'purchase_orders.supplier' as relation, o.id as row_id, o.org_id, s.id as related_id
from purchase_orders o join suppliers s on s.id = o.supplier_id where o.org_id <> s.org_id
union all
select 'purchase_orders.warehouse', o.id, o.org_id, w.id
from purchase_orders o join warehouses w on w.id = o.warehouse_id where o.org_id <> w.org_id
union all
select 'purchase_lines.order', l.id, l.org_id, o.id
from purchase_lines l join purchase_orders o on o.id = l.order_id where l.org_id <> o.org_id
union all
select 'purchase_lines.product', l.id, l.org_id, p.id
from purchase_lines l join products p on p.id = l.product_id where l.org_id <> p.org_id
union all
select 'sales_orders.customer', o.id, o.org_id, c.id
from sales_orders o join customers c on c.id = o.customer_id where o.org_id <> c.org_id
union all
select 'sales_orders.warehouse', o.id, o.org_id, w.id
from sales_orders o join warehouses w on w.id = o.warehouse_id where o.org_id <> w.org_id
union all
select 'sales_lines.order', l.id, l.org_id, o.id
from sales_lines l join sales_orders o on o.id = l.order_id where l.org_id <> o.org_id
union all
select 'sales_lines.product', l.id, l.org_id, p.id
from sales_lines l join products p on p.id = l.product_id where l.org_id <> p.org_id;

-- Stocktaking, BOM, and inventory ledger relationships.
select 'stocktakes.warehouse' as relation, s.id as row_id, s.org_id, w.id as related_id
from stocktakes s join warehouses w on w.id = s.warehouse_id where s.org_id <> w.org_id
union all
select 'stocktake_lines.stocktake', l.id, l.org_id, s.id
from stocktake_lines l join stocktakes s on s.id = l.stocktake_id where l.org_id <> s.org_id
union all
select 'stocktake_lines.product', l.id, l.org_id, p.id
from stocktake_lines l join products p on p.id = l.product_id where l.org_id <> p.org_id
union all
select 'boms.product', b.id, b.org_id, p.id
from boms b join products p on p.id = b.product_id where b.org_id <> p.org_id
union all
select 'bom_lines.bom', l.id, l.org_id, b.id
from bom_lines l join boms b on b.id = l.bom_id where l.org_id <> b.org_id
union all
select 'bom_lines.product', l.id, l.org_id, p.id
from bom_lines l join products p on p.id = l.product_id where l.org_id <> p.org_id
union all
select 'ledger.document', l.id, l.org_id, d.id
from ledger l join documents d on d.id = l.document_id where l.org_id <> d.org_id
union all
select 'ledger.product', l.id, l.org_id, p.id
from ledger l join products p on p.id = l.product_id where l.org_id <> p.org_id
union all
select 'ledger.warehouse', l.id, l.org_id, w.id
from ledger l join warehouses w on w.id = l.warehouse_id where l.org_id <> w.org_id;

-- Additional tenant links introduced by Phase 1.
select 'warehouses.branch' as relation, w.id as row_id, w.org_id, b.id as related_id
from warehouses w join branches b on b.id = w.branch_id where w.org_id <> b.org_id
union all
select 'locations.parent', l.id, l.org_id, p.id
from locations l join locations p on p.id = l.parent_id where l.org_id <> p.org_id
union all
select 'product_units.product', pu.product_id, pu.org_id, p.id
from product_units pu join products p on p.id = pu.product_id where pu.org_id <> p.org_id
union all
select 'product_units.unit', pu.product_id, pu.org_id, u.id
from product_units pu join units u on u.id = pu.unit_id where pu.org_id <> u.org_id
union all
select 'ledger.line', l.id, l.org_id, dl.id
from ledger l join document_lines dl on dl.id = l.line_id where l.org_id <> dl.org_id
union all
select 'stock_balance.product', b.product_id, b.org_id, p.id
from stock_balance b join products p on p.id = b.product_id where b.org_id <> p.org_id
union all
select 'stock_balance.warehouse', b.product_id, b.org_id, w.id
from stock_balance b join warehouses w on w.id = b.warehouse_id where b.org_id <> w.org_id
union all
select 'stock_batch.product', b.product_id, b.org_id, p.id
from stock_batch b join products p on p.id = b.product_id where b.org_id <> p.org_id
union all
select 'stock_batch.warehouse', b.product_id, b.org_id, w.id
from stock_batch b join warehouses w on w.id = b.warehouse_id where b.org_id <> w.org_id
union all
select 'stock_serial.product', s.product_id, s.org_id, p.id
from stock_serial s join products p on p.id = s.product_id where s.org_id <> p.org_id
union all
select 'stock_serial.warehouse', s.product_id, s.org_id, w.id
from stock_serial s join warehouses w on w.id = s.warehouse_id where s.org_id <> w.org_id
union all
select 'stock_serial.document', s.product_id, s.org_id, d.id
from stock_serial s join documents d on d.id = s.document_id where s.org_id <> d.org_id
union all
select 'sales_orders.reservation_document', s.id, s.org_id, d.id
from sales_orders s join documents d on d.id = s.reservation_document_id where s.org_id <> d.org_id
union all
select 'stocktakes.adjustment_document', s.id, s.org_id, d.id
from stocktakes s join documents d on d.id = s.adjustment_document_id where s.org_id <> d.org_id;

-- Once every audit query above returns zero rows, validate the tenant constraints
-- from migration 0003. Run each statement in the same migration/admin session.
-- ALTER TABLE warehouses VALIDATE CONSTRAINT warehouses_branch_tenant_fk;
-- ALTER TABLE categories VALIDATE CONSTRAINT categories_parent_tenant_fk;
-- ALTER TABLE locations VALIDATE CONSTRAINT locations_warehouse_tenant_fk;
-- ALTER TABLE locations VALIDATE CONSTRAINT locations_parent_tenant_fk;
-- ALTER TABLE products VALIDATE CONSTRAINT products_category_tenant_fk;
-- ALTER TABLE products VALIDATE CONSTRAINT products_unit_tenant_fk;
-- ALTER TABLE products VALIDATE CONSTRAINT products_supplier_tenant_fk;
-- ALTER TABLE products VALIDATE CONSTRAINT products_parent_tenant_fk;
-- ALTER TABLE product_units VALIDATE CONSTRAINT product_units_product_tenant_fk;
-- ALTER TABLE product_units VALIDATE CONSTRAINT product_units_unit_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_warehouse_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_warehouse_to_tenant_fk;
-- ALTER TABLE document_lines VALIDATE CONSTRAINT document_lines_document_tenant_fk;
-- ALTER TABLE document_lines VALIDATE CONSTRAINT document_lines_product_tenant_fk;
-- ALTER TABLE document_lines VALIDATE CONSTRAINT document_lines_unit_tenant_fk;
-- ALTER TABLE purchase_orders VALIDATE CONSTRAINT purchase_orders_supplier_tenant_fk;
-- ALTER TABLE purchase_orders VALIDATE CONSTRAINT purchase_orders_warehouse_tenant_fk;
-- ALTER TABLE purchase_lines VALIDATE CONSTRAINT purchase_lines_order_tenant_fk;
-- ALTER TABLE purchase_lines VALIDATE CONSTRAINT purchase_lines_product_tenant_fk;
-- ALTER TABLE purchase_lines VALIDATE CONSTRAINT purchase_lines_unit_tenant_fk;
-- ALTER TABLE sales_orders VALIDATE CONSTRAINT sales_orders_customer_tenant_fk;
-- ALTER TABLE sales_orders VALIDATE CONSTRAINT sales_orders_warehouse_tenant_fk;
-- ALTER TABLE sales_lines VALIDATE CONSTRAINT sales_lines_order_tenant_fk;
-- ALTER TABLE sales_lines VALIDATE CONSTRAINT sales_lines_product_tenant_fk;
-- ALTER TABLE sales_lines VALIDATE CONSTRAINT sales_lines_unit_tenant_fk;
-- ALTER TABLE stocktakes VALIDATE CONSTRAINT stocktakes_warehouse_tenant_fk;
-- ALTER TABLE stocktake_lines VALIDATE CONSTRAINT stocktake_lines_stocktake_tenant_fk;
-- ALTER TABLE stocktake_lines VALIDATE CONSTRAINT stocktake_lines_product_tenant_fk;
-- ALTER TABLE boms VALIDATE CONSTRAINT boms_product_tenant_fk;
-- ALTER TABLE bom_lines VALIDATE CONSTRAINT bom_lines_bom_tenant_fk;
-- ALTER TABLE bom_lines VALIDATE CONSTRAINT bom_lines_product_tenant_fk;
-- ALTER TABLE document_lines VALIDATE CONSTRAINT document_lines_location_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_reverses_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_reversed_by_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_sales_order_tenant_fk;
-- ALTER TABLE documents VALIDATE CONSTRAINT documents_purchase_order_tenant_fk;
-- ALTER TABLE ledger VALIDATE CONSTRAINT ledger_document_tenant_fk;
-- ALTER TABLE ledger VALIDATE CONSTRAINT ledger_line_tenant_fk;
-- ALTER TABLE ledger VALIDATE CONSTRAINT ledger_product_tenant_fk;
-- ALTER TABLE ledger VALIDATE CONSTRAINT ledger_warehouse_tenant_fk;
-- ALTER TABLE stock_balance VALIDATE CONSTRAINT stock_balance_product_tenant_fk;
-- ALTER TABLE stock_balance VALIDATE CONSTRAINT stock_balance_warehouse_tenant_fk;
-- ALTER TABLE stock_batch VALIDATE CONSTRAINT stock_batch_product_tenant_fk;
-- ALTER TABLE stock_batch VALIDATE CONSTRAINT stock_batch_warehouse_tenant_fk;
-- ALTER TABLE stock_serial VALIDATE CONSTRAINT stock_serial_product_tenant_fk;
-- ALTER TABLE stock_serial VALIDATE CONSTRAINT stock_serial_warehouse_tenant_fk;
-- ALTER TABLE stock_serial VALIDATE CONSTRAINT stock_serial_document_tenant_fk;
-- ALTER TABLE sales_orders VALIDATE CONSTRAINT sales_orders_reservation_document_tenant_fk;
-- ALTER TABLE stocktakes VALIDATE CONSTRAINT stocktakes_adjustment_document_tenant_fk;
