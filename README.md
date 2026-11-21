# Smart Stock AI

**نظام ذكي لإدارة المخازن والمبيعات والمشتريات والعمليات المالية باستخدام الذكاء الاصطناعي.**

Smart Stock AI هو تطبيق لإدارة ومتابعة عمليات المخزون والأعمال التجارية، مع مساعد ذكي يعتمد على Google Gemini.

## المميزات الرئيسية

- إدارة المنتجات والأصناف والتصنيفات.
- إدارة المخازن والفروع.
- متابعة المخزون وحركات الصرف والإضافة.
- إدارة العملاء والموردين.
- إدارة المبيعات والمشتريات.
- إدارة الإنتاج والجرد.
- التقارير المالية وتقارير المخزون.
- إدارة المستخدمين والفريق والصلاحيات.
- الإشعارات والإعدادات والاشتراكات.
- مساعد ذكاء اصطناعي باستخدام Google Gemini.

## التقنيات المستخدمة

- React 19
- TypeScript
- TanStack Start
- TanStack Router
- Vite
- PostgreSQL
- PGlite
- Neon
- Better Auth
- Capacitor 8
- Google Gemini API

## متطلبات التشغيل

- Node.js
- npm
- Git
- Java 21 وAndroid SDK لبناء تطبيق Android.

## تثبيت المشروع

```bash
git clone https://github.com/hosnielshrkawy-del/smart-stock-ai.git
cd smart-stock-ai
npm install
## إعداد Gemini AI

أنشئ ملف `.env` في المجلد الرئيسي:

```env
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3-flash-preview
DATABASE_URL=YOUR_DATABASE_CONNECTION_STRING
npm run dev
npm test
npm run typecheck
npm run check:auth
npm run build:dev
