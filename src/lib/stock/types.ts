export type LineInput = {
  productId: string;
  qty: number;
  unitId?: string;
  unitCost?: number;
  unitPrice?: number;
  taxRate?: number;
  direction?: "in" | "out";
  batchNo?: string;
  expiry?: string;
  serialNo?: string;
  locationId?: string;
};

export type DocInput = {
  orgId: string;
  id?: string;
  idempotencyKey?: string;
  docType: string;
  warehouseId?: string;
  warehouseToId?: string;
  partnerType?: string;
  partnerId?: string;
  reference?: string;
  reason?: string;
  notes?: string;
  lines: LineInput[];
};

export type ProductInput = {
  orgId: string;
  id?: string;
  sku: string;
  barcode?: string;
  nameAr: string;
  nameEn?: string;
  description?: string;
  image?: string;
  categoryId?: string;
  brand?: string;
  manufacturer?: string;
  productType: string;
  baseUnitId?: string;
  price?: number;
  reorderPoint?: number;
  minQty?: number;
  maxQty?: number | null;
  supplierId?: string;
  trackBatch?: boolean;
  trackExpiry?: boolean;
  trackSerial?: boolean;
  parentId?: string;
  notes?: string;
  custom?: Record<string, string>;
  units?: { unitId: string; factor: number }[];
};

export type OrgSettings = {
  hideSales?: boolean;
  forceProduction?: boolean;
};
