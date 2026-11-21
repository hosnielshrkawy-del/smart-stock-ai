import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { can } from "./permissions.ts";

test("permissions: owner ignores revokes, operator cannot post cost", () => {
  assert.equal(can("owner", [], ["stock.post"], "stock.post"), true);
  assert.equal(can("warehouse_operator", [], [], "stock.post"), true);
  assert.equal(can("warehouse_operator", [], [], "cost.view"), false);
  assert.equal(can("viewer", ["stock.post"], [], "stock.post"), true);
  assert.equal(can("accountant", [], ["cost.view"], "cost.view"), false);
  assert.equal(can("stranger", [], [], "products.view"), false);
});

async function setup() {
  const pg = new PGlite();
  const schema = readFileSync(new URL("../../../migrations/0002_smart_stock.sql", import.meta.url), "utf8");
  const saas = readFileSync(new URL("../../../migrations/0003_saas_foundation.sql", import.meta.url), "utf8");
  await pg.exec(schema);
  await pg.exec(saas);
  await pg.query("select set_config('app.user_id', 'user-a', false)");
  await pg.query("select set_config('app.org_ids', '', false)");
  const org = await pg.query<{ id: string }>(
    `insert into organizations (name, created_by) values ('Org', 'user-a') returning id`,
  );
  const orgId = org.rows[0].id;
  await pg.query(`insert into memberships (org_id, user_id, role) values ($1, 'user-a', 'owner')`, [orgId]);
  await pg.query("select set_config('app.org_ids', $1, false)", [orgId]);
  await pg.query(`insert into branches (org_id, code, name_ar, is_default) values ($1, 'MAIN', 'الفرع الرئيسي', true)`, [orgId]);
  await pg.query("select set_config('app.user_id', 'user-b', false)");
  await pg.query("select set_config('app.org_ids', '', false)");
  const orgB = await pg.query<{ id: string }>(
    `insert into organizations (name, created_by) values ('Other', 'user-b') returning id`,
  );
  const other = orgB.rows[0].id;
  await pg.query(`insert into memberships (org_id, user_id, role) values ($1, 'user-b', 'owner')`, [other]);
  await pg.query("select set_config('app.org_ids', $1, false)", [other]);
  const otherUnit = await pg.query<{ id: string }>(
    `insert into units (org_id, code, name_ar, name_en) values ($1, 'pcs', 'قطعة', 'Piece') returning id`,
    [other],
  );
  await pg.query("select set_config('app.user_id', 'user-a', false)");
  await pg.query("select set_config('app.org_ids', $1, false)", [orgId]);
  const unit = await pg.query<{ id: string }>(
    `insert into units (org_id, code, name_ar, name_en) values ($1, 'pcs', 'قطعة', 'Piece') returning id`,
    [orgId],
  );
  const unitId = unit.rows[0].id;
  const box = await pg.query<{ id: string }>(
    `insert into units (org_id, code, name_ar, name_en) values ($1, 'box', 'علبة', 'Box') returning id`,
    [orgId],
  );
  const wh1 = await pg.query<{ id: string }>(
    `insert into warehouses (org_id, code, name_ar) values ($1, 'MAIN', 'الرئيسي') returning id`,
    [orgId],
  );
  const wh2 = await pg.query<{ id: string }>(
    `insert into warehouses (org_id, code, name_ar) values ($1, 'BR', 'الفرع') returning id`,
    [orgId],
  );
  const product = await pg.query<{ id: string }>(
    `insert into products (org_id, sku, name_ar, base_unit_id, reorder_point)
     values ($1, 'SKU-1', 'صنف', $2, 3) returning id`,
    [orgId, unitId],
  );
  const productId = product.rows[0].id;
  await pg.query(`insert into product_units (org_id, product_id, unit_id, factor) values ($1, $2, $3, 12)`, [
    orgId,
    productId,
    box.rows[0].id,
  ]);
  return {
    pg,
    orgId,
    other,
    otherUnitId: otherUnit.rows[0].id,
    unitId,
    boxId: box.rows[0].id,
    wh1: wh1.rows[0].id,
    wh2: wh2.rows[0].id,
    productId,
  };
}

async function bal(pg: PGlite, org: string, product: string, wh: string) {
  const rows = await pg.query<{ on_hand: string; reserved: string }>(
    `select on_hand::text, reserved::text from stock_balance
     where org_id = $1 and product_id = $2 and warehouse_id = $3`,
    [org, product, wh],
  );
  return rows.rows[0] ?? { on_hand: "0", reserved: "0" };
}

test("inventory engine: receipt, average cost, issue, transfer, reverse, policy, isolation", async () => {
  const { pg, orgId, other, otherUnitId, wh1, wh2, productId, boxId } = await setup();

  await pg.exec("CREATE ROLE stock_rls_test");
  await pg.exec("GRANT SELECT ON organizations, units TO stock_rls_test");
  await pg.query("SET ROLE stock_rls_test");

  const hiddenOrg = await pg.query(`select id from organizations where id = $1`, [other]);
  assert.equal(hiddenOrg.rows.length, 0, "RLS must hide organizations outside the request tenant scope");
  const hiddenUnits = await pg.query(`select id from units where org_id = $1`, [other]);
  assert.equal(hiddenUnits.rows.length, 0, "RLS must hide tenant rows outside the request scope");

  await pg.query("RESET ROLE");
  await assert.rejects(
    pg.query(
      `insert into products (org_id, sku, name_ar, base_unit_id) values ($1, 'CROSS-TENANT', 'ممنوع', $2)`,
      [orgId, otherUnitId],
    ),
    "composite tenant foreign keys must reject cross-organization references",
  );

  const receipt = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [
      orgId,
      JSON.stringify({
        docType: "receipt",
        idempotencyKey: "r1",
        warehouseId: wh1,
        lines: [{ productId, qty: 1, unitId: boxId, unitCost: 120 }],
      }),
    ],
  );
  const rid = receipt.rows[0].ss_save_document;
  const again = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "receipt", idempotencyKey: "r1", warehouseId: wh1, lines: [{ productId, qty: 1 }] })],
  );
  assert.equal(again.rows[0].ss_save_document, rid);
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, rid]);
  let b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 12);
  const cost = await pg.query<{ avg_cost: string }>(`select avg_cost::text from products where id = $1`, [productId]);
  assert.equal(Number(cost.rows[0].avg_cost), 10);

  const receipt2 = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "receipt", warehouseId: wh1, lines: [{ productId, qty: 8, unitCost: 20 }] })],
  );
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, receipt2.rows[0].ss_save_document]);
  const cost2 = await pg.query<{ avg_cost: string }>(`select avg_cost::text from products where id = $1`, [productId]);
  assert.equal(Number(cost2.rows[0].avg_cost), 14);

  const issue = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "issue", warehouseId: wh1, lines: [{ productId, qty: 5 }] })],
  );
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, issue.rows[0].ss_save_document]);
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 15);

  const tooMuch = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "issue", warehouseId: wh1, lines: [{ productId, qty: 100 }] })],
  );
  await assert.rejects(
    pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, tooMuch.rows[0].ss_save_document]),
    /SS:INSUFFICIENT/,
  );
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 15, "failed post must not change balance");

  const tr = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "transfer", warehouseId: wh1, warehouseToId: wh2, lines: [{ productId, qty: 4 }] })],
  );
  const trId = tr.rows[0].ss_save_document;
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, trId]);
  assert.equal(Number((await bal(pg, orgId, productId, wh1)).on_hand), 11);
  assert.equal(Number((await bal(pg, orgId, productId, wh2)).on_hand), 4);

  await pg.query(`select ss_reverse_document($1, $2, 'user-a', 'test')`, [orgId, trId]);
  assert.equal(Number((await bal(pg, orgId, productId, wh1)).on_hand), 15);
  assert.equal(Number((await bal(pg, orgId, productId, wh2)).on_hand), 0);
  await assert.rejects(
    pg.query(`select ss_reverse_document($1, $2, 'user-a', 'again')`, [orgId, trId]),
    /SS:NOT_POSTED|SS:ALREADY_REVERSED/,
  );

  await assert.rejects(
    pg.query(`update ledger set qty_base = 0`),
    /SS:IMMUTABLE/,
  );

  await assert.rejects(
    pg.query(`select ss_post_document($1, $2, 'user-b')`, [other, rid]),
    /SS:NOT_FOUND|SS:FORBIDDEN/,
  );
  await assert.rejects(
    pg.query(`select ss_post_document($1, $2, 'user-b')`, [orgId, rid]),
    /SS:FORBIDDEN/,
  );
});

test("reservation blocks free issue; dispatch consumes reserved once", async () => {
  const { pg, orgId, wh1, productId } = await setup();
  const open = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "opening", warehouseId: wh1, lines: [{ productId, qty: 10, unitCost: 5 }] })],
  );
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, open.rows[0].ss_save_document]);
  const cust = await pg.query<{ id: string }>(
    `insert into customers (org_id, code, name_ar) values ($1, 'C1', 'عميل') returning id`,
    [orgId],
  );
  const so = await pg.query<{ id: string }>(
    `insert into sales_orders (org_id, doc_no, customer_id, warehouse_id, created_by)
     values ($1, 'SO-TEST', $2, $3, 'user-a') returning id`,
    [orgId, cust.rows[0].id, wh1],
  );
  const soId = so.rows[0].id;
  await pg.query(
    `insert into sales_lines (order_id, org_id, product_id, qty, qty_base, unit_price)
     values ($1, $2, $3, 6, 6, 9)`,
    [soId, orgId, productId],
  );
  await pg.query(`select ss_confirm_sales($1, $2, 'user-a')`, [orgId, soId]);
  let b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 10);
  assert.equal(Number(b.reserved), 6);

  const issue = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "issue", warehouseId: wh1, lines: [{ productId, qty: 5 }] })],
  );
  await assert.rejects(
    pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, issue.rows[0].ss_save_document]),
    /SS:INSUFFICIENT/,
  );

  const line = await pg.query<{ id: string }>(`select id from sales_lines where order_id = $1`, [soId]);
  await pg.query(`select ss_dispatch_sales($1, $2, 'user-a', $3::jsonb, 'dsp-1')`, [
    orgId,
    soId,
    JSON.stringify([{ lineId: line.rows[0].id, qty: 6 }]),
  ]);
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 4);
  assert.equal(Number(b.reserved), 0);
  const dup = await pg.query<{ ss_dispatch_sales: string }>(
    `select ss_dispatch_sales($1, $2, 'user-a', $3::jsonb, 'dsp-1')`,
    [orgId, soId, JSON.stringify([{ lineId: line.rows[0].id, qty: 6 }])],
  );
  assert.ok(dup.rows[0].ss_dispatch_sales);
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 4, "idempotent dispatch must not double-issue");
});

test("stocktake posts an adjustment instead of editing the balance directly", async () => {
  const { pg, orgId, wh1, productId } = await setup();
  const open = await pg.query<{ ss_save_document: string }>(
    `select ss_save_document($1, 'user-a', $2::jsonb)`,
    [orgId, JSON.stringify({ docType: "opening", warehouseId: wh1, lines: [{ productId, qty: 10 }] })],
  );
  await pg.query(`select ss_post_document($1, $2, 'user-a')`, [orgId, open.rows[0].ss_save_document]);
  const st = await pg.query<{ ss_create_stocktake: string }>(
    `select ss_create_stocktake($1, $2, 'user-a', 'cycle')`,
    [orgId, wh1],
  );
  const stId = st.rows[0].ss_create_stocktake;
  await pg.query(`update stocktake_lines set counted_qty = 8 where stocktake_id = $1`, [stId]);
  await pg.query(`select ss_post_stocktake($1, $2, 'user-a')`, [orgId, stId]);
  const b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 8);
  const docs = await pg.query<{ doc_type: string }>(
    `select doc_type from documents where org_id = $1 and doc_type = 'adjustment' and status = 'posted'`,
    [orgId],
  );
  assert.equal(docs.rows.length, 1);
});

test("purchase receipt is partial then complete and does not receive twice", async () => {
  const { pg, orgId, wh1, productId } = await setup();
  const sup = await pg.query<{ id: string }>(
    `insert into suppliers (org_id, code, name_ar) values ($1, 'S1', 'مورد') returning id`,
    [orgId],
  );
  const po = await pg.query<{ id: string }>(
    `insert into purchase_orders (org_id, doc_no, supplier_id, warehouse_id, status, created_by)
     values ($1, 'PO-1', $2, $3, 'approved', 'user-a') returning id`,
    [orgId, sup.rows[0].id, wh1],
  );
  const line = await pg.query<{ id: string }>(
    `insert into purchase_lines (order_id, org_id, product_id, qty, unit_price)
     values ($1, $2, $3, 10, 4) returning id`,
    [po.rows[0].id, orgId, productId],
  );
  await pg.query(`select ss_receive_po($1, $2, 'user-a', $3::jsonb, 'rcv-1')`, [
    orgId,
    po.rows[0].id,
    JSON.stringify([{ lineId: line.rows[0].id, qty: 4 }]),
  ]);
  let b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 4);
  const status = await pg.query<{ status: string }>(`select status from purchase_orders where id = $1`, [po.rows[0].id]);
  assert.equal(status.rows[0].status, "partial");
  await pg.query(`select ss_receive_po($1, $2, 'user-a', $3::jsonb, 'rcv-1')`, [
    orgId,
    po.rows[0].id,
    JSON.stringify([{ lineId: line.rows[0].id, qty: 4 }]),
  ]);
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 4, "same idempotency key must not receive again");
  await pg.query(`select ss_receive_po($1, $2, 'user-a', $3::jsonb, 'rcv-2')`, [
    orgId,
    po.rows[0].id,
    JSON.stringify([{ lineId: line.rows[0].id, qty: 6 }]),
  ]);
  b = await bal(pg, orgId, productId, wh1);
  assert.equal(Number(b.on_hand), 10);
  await assert.rejects(
    pg.query(`select ss_receive_po($1, $2, 'user-a', $3::jsonb, 'rcv-3')`, [
      orgId,
      po.rows[0].id,
      JSON.stringify([{ lineId: line.rows[0].id, qty: 1 }]),
    ]),
    /SS:NOT_APPROVED|SS:OVER_RECEIVE/,
  );
});
