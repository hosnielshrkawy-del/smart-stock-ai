# Smart Stock AI — تحديث Gemini والواجهات التشغيلية

## ما تم تغييره

- استبدال استدعاءات xAI/Grok في المحادثة واستخراج الفواتير بواجهة Gemini REST API.
- اعتماد `gemini-3.8-flash` افتراضيًا مع إمكانية تغيير النموذج عبر `GEMINI_MODEL`.
- إبقاء `GEMINI_API_KEY` في الخادم فقط، وإرسال المفتاح في ترويسة الطلب بدلًا من عنوان URL.
- إضافة مهلة 30 ثانية، والتحقق من أنواع الصور وحجمها، والتعامل مع فشل المزود دون إظهار تفاصيله الحساسة للمستخدم.
- توحيد حد الاستخدام الداخلي إلى 24 طلبًا لكل مستخدم في الساعة للمحادثة واستخراج الفواتير.
- إنشاء صفحة المساعد الذكي وربطها بلقطة بيانات المخزون وصلاحيات المؤسسة، مع تمييز التوقعات عن الحقائق ومنع إظهار التكلفة لمن لا يملك صلاحيتها.
- إضافة صفحات فعلية للتنبيهات، والفريق، وملف النشاط، والإعدادات بدلًا من روابط قائمة كانت بلا صفحات.
- الحفاظ على أدوار وصلاحيات أعضاء الفريق عند تغيير الدور، وعدم اعتماد نتائج قراءة الفواتير أو ترحيلها تلقائيًا.
- إضافة `.env.example` و`GEMINI_SETUP.md` لتوضيح إعداد المفتاح المجاني وحمايته.

## قبل تشغيل الذكاء الاصطناعي

يجب إنشاء مفتاح Google AI Studio وضبط `GEMINI_API_KEY` في بيئة الخادم. لا يوجد مفتاح API مضمن في هذه الحزمة، ولا ينبغي وضعه في كود المتصفح أو مشاركته في المحادثة.

## حالة التحقق

- فحص بناء الجملة للملفات المعدلة: ناجح.
- فحص تسجيل المسارات الجديدة: ناجح.
- فحص إزالة مراجع xAI من موضع تنفيذ الذكاء الاصطناعي: ناجح.
- اختبارات JavaScript المساعدة: 190 ناجحًا و7 إخفاقات في اختبارات المصدر الحالية تتعلق بهوية Grok/PWA وبنية مجلدات migrations، وليست في ملفات Gemini أو الصفحات الجديدة.
- تعذر تثبيت الاعتماديات بسبب تعذر الوصول إلى npm registry (`EAI_AGAIN`). لذلك تعذر تحميل بعض اختبارات التطبيق التي تعتمد على الحزم غير المثبتة، ولم يُنفذ build أو فحص TypeScript الكامل أو اختبار متصفح.
- لم يُختبر اتصال Gemini الحي لعدم توفر مفتاح API؛ يلزم ضبط المفتاح أولًا.

---

# SaaS progress — Phase 2 implementation tranche

## Added in this tranche

- Organization onboarding now asks for a country and applies an initial currency/time-zone pair for supported Arab markets; currency remains editable.
- Added branch administration (create, edit, activate/deactivate, default-branch handling) and linked warehouses to their branches.
- Added warehouse editing and branch reassignment; plan warehouse limits are checked when creating and reactivating warehouses.
- Added a subscription overview showing the current subscription, trial dates, active resource usage, published plans, and configured country/currency prices.
- Added server-side, data-driven entitlement checks for active products, warehouses, branches, and organization members. Import and reactivation paths are included. An absent limit remains unconfigured; zero is an explicit zero cap.
- Added the `/platform` console. Enabled platform admins can inspect plans, prices, and the audit log; only `super_admin` can edit plan JSON, plan visibility/status, and market prices.
- Added migration `0004_platform_admin_console.sql`, an RLS-protected platform audit table, and the DBA bootstrap procedure in `scripts/bootstrap-platform-admin.sql`.
- Added `PLATFORM_ADMIN.md` with setup and market-pricing guidance.

## Verification in this tranche

- TypeScript/TSX transpilation syntax check: 82 files, zero parse diagnostics.
- Entitlement and currency precision tests: 9/9 passed.
- Migration-plan tests: 7/7 passed.
- All script tests: 191/197 passed. Six existing `grok-pwa-plugin` tests still fail because the current `src/lib/og/site.json` title (`Smart Stock AI`) overrides test fixtures that expect fixture-specific document/host titles.
- Full TypeScript typecheck and application tests could not run because dependencies are absent. `npm ci` timed out and offline installation cannot retrieve uncached packages (`ajv`).
- No PostgreSQL server/connection or Docker runtime is available in this environment, so migrations 0003/0004 and RLS behavior have not been exercised against a real database. Do not deploy this tranche to production until those checks pass.

## Still not enabled

- No payment provider is connected and no credentials are included.
- No checkout, subscription-change workflow, tax invoice issuance, payment webhook/reconciliation, or live subscription renewal is enabled.
- Plan prices and entitlement limits are intentionally unset until approved by the platform owner.
- Global tenant analytics are not exposed in the platform console; a separately reviewed privileged reporting design is required to preserve tenant RLS.

---

# Finance Phase 2 — automated posting and cash management

- Built on the latest Phase 1 archive merged onto the user's most recent uploaded project.
- Added `migrations/0006_finance_operations.sql` for source documents, cash/bank accounts, cash transactions, payment allocations, bank statement lines, and pending finance review events.
- Added automatic double-entry posting for sales dispatches, purchase receipts, opening stock, issues, damage, consumption, and stock adjustments.
- Added cash/bank/wallet accounts, opening balances, receipts, payments, transfers, expenses, income, allocations and safe voucher reversals.
- Added customer/supplier open balances, due dates, aging, trial balance, income statement, balance-sheet summary, cash movement summary and inventory valuation.
- Added manual bank statement line entry and matching validation.
- Expanded the Finance screen with these workflows and reports.
- Return documents are queued for finance review until the original invoice line and historical price/tax can be matched safely.
- See `FINANCE_PHASE2_NOTES.md` for full scope, accounting behavior, limitations and verification status.
