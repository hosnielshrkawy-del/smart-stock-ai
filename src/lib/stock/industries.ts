export const INDUSTRIES = [
  "general",
  "retail",
  "wholesale",
  "restaurant",
  "pharmacy",
  "manufacturing",
  "equipment",
  "construction",
  "importexport",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export type ModuleId =
  | "overview"
  | "inventory"
  | "products"
  | "categories"
  | "warehouses"
  | "branches"
  | "subscription"
  | "movements"
  | "purchasing"
  | "suppliers"
  | "sales"
  | "customers"
  | "stocktaking"
  | "reports"
  | "assistant"
  | "notifications"
  | "team"
  | "industry"
  | "settings"
  | "production";

const BASE: ModuleId[] = [
  "overview",
  "inventory",
  "products",
  "categories",
  "warehouses",
  "branches",
  "subscription",
  "movements",
  "purchasing",
  "suppliers",
  "customers",
  "stocktaking",
  "reports",
  "assistant",
  "notifications",
  "team",
  "industry",
  "settings",
];

export function modulesFor(industry: string, settings: { hideSales?: boolean; forceProduction?: boolean } = {}): ModuleId[] {
  const mods = new Set<ModuleId>(BASE);
  const sales =
    !settings.hideSales &&
    industry !== "construction";
  if (sales) mods.add("sales");
  if (
    settings.forceProduction ||
    industry === "manufacturing" ||
    industry === "restaurant"
  ) {
    mods.add("production");
  }
  return [...mods];
}

export type FieldSeed = {
  key: string;
  fieldType: "text" | "number" | "decimal" | "date" | "boolean" | "select";
  labelAr: string;
  labelEn: string;
  options?: string[];
};

export const INDUSTRY_FIELDS: Record<string, FieldSeed[]> = {
  pharmacy: [
    { key: "active_ingredient", fieldType: "text", labelAr: "المادة الفعالة", labelEn: "Active ingredient" },
    { key: "dosage_form", fieldType: "text", labelAr: "الشكل الدوائي", labelEn: "Dosage form" },
    { key: "storage", fieldType: "text", labelAr: "شروط التخزين", labelEn: "Storage" },
  ],
  equipment: [
    { key: "model", fieldType: "text", labelAr: "الموديل", labelEn: "Model" },
    { key: "warranty_until", fieldType: "date", labelAr: "نهاية الضمان", labelEn: "Warranty until" },
    {
      key: "condition",
      fieldType: "select",
      labelAr: "الحالة",
      labelEn: "Condition",
      options: ["new", "good", "fair", "repair"],
    },
  ],
  restaurant: [
    { key: "station", fieldType: "text", labelAr: "محطة التحضير", labelEn: "Station" },
    { key: "allergen", fieldType: "text", labelAr: "مسببات الحساسية", labelEn: "Allergen" },
  ],
  construction: [
    { key: "spec", fieldType: "text", labelAr: "المواصفة", labelEn: "Specification" },
  ],
  importexport: [
    { key: "hs_code", fieldType: "text", labelAr: "بند جمركي", labelEn: "HS code" },
    { key: "origin_country", fieldType: "text", labelAr: "بلد المنشأ", labelEn: "Origin" },
  ],
};

export const UNIT_SEEDS = [
  { code: "pcs", nameAr: "قطعة", nameEn: "Piece", dimension: "count" },
  { code: "box", nameAr: "علبة", nameEn: "Box", dimension: "count" },
  { code: "ctn", nameAr: "كرتونة", nameEn: "Carton", dimension: "count" },
  { code: "pack", nameAr: "عبوة", nameEn: "Pack", dimension: "count" },
  { code: "kg", nameAr: "كيلوجرام", nameEn: "Kilogram", dimension: "mass" },
  { code: "g", nameAr: "جرام", nameEn: "Gram", dimension: "mass" },
  { code: "l", nameAr: "لتر", nameEn: "Liter", dimension: "volume" },
  { code: "ml", nameAr: "مليلتر", nameEn: "Milliliter", dimension: "volume" },
  { code: "m", nameAr: "متر", nameEn: "Meter", dimension: "length" },
];
