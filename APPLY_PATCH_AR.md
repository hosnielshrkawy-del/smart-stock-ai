# تطبيق دفعة الإصلاح على Termux

> أوقف الخادم الحالي أولًا باستخدام `Ctrl + C`. لا تحذف المشروع ولا مجلد `node_modules`.

## 1) نسخة احتياطية

```bash
cd ~/smart-stock-build/stock-work
BACKUP="$HOME/Smart-Stock-AI-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$BACKUP" --exclude='./node_modules' --exclude='./.git' .
echo "Backup: $BACKUP"
```

## 2) فك حزمة الإصلاح

بعد تنزيل ملف ZIP من المحادثة إلى مجلد Downloads في Android:

```bash
cd ~/smart-stock-build/stock-work
unzip -o ~/storage/downloads/Smart-Stock-AI-Phase1-Patch.zip -d .
```

إذا كان Android حفظ الملف في مجلد مختلف، عدّل مسار ملف ZIP فقط.

## 3) الاختبارات

```bash
cd ~/smart-stock-build/stock-work
npm test
```

لا تنتقل إلى اختبار بيانات حقيقية. أنشئ مؤسسة اختبار مستقلة عبر خيار «بيانات تجريبية».

## 4) ضبط Gemini بأمان

ألغِ المفتاح الذي أُرسل في المحادثة أولًا، وأنشئ مفتاحًا جديدًا. لا ترسله إلى الدردشة ولا تضعه في ملف `.env` أو متغير يبدأ بـ `VITE_`.

أدخله مخفيًا في جلسة Termux التي ستشغّل الخادم:

```bash
read -rsp "Gemini API key: " GEMINI_API_KEY; printf '\n'; export GEMINI_API_KEY
npm run dev
```

يبقى المتغير متاحًا في جلسة Termux الحالية فقط. عند فتح جلسة جديدة، أدخله مرة أخرى.

## 5) التحقق على الهاتف

افتح `http://localhost:8080/` على نفس الهاتف. جرّب إنشاء مستند بيع/صرف، ثم افتح المساعد واسأله عن رصيد أحد الأصناف الموجودة في المؤسسة التجريبية. احتفظ بسجل Termux عند ظهور أي خطأ، واحذف منه أي قيمة سرية قبل مشاركته.
