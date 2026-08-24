# راه‌اندازی Schema نهایی ThinkShop

این فایل `schema.sql` برای اجرای یک‌باره روی **همان D1 متصل به Worker با binding به نام `DB`** آماده شده است.

نکته مهم: قرار دادن `schema.sql` در GitHub به‌تنهایی آن را روی D1 اجرا نمی‌کند. Cloudflare Pages فایل SQL را خودکار اجرا نمی‌کند.

## روش پیشنهادی و راحت

1. این نسخه `schema.sql` را در Repository تستی Commit/Push کن.
2. در Cloudflare Dashboard برو به **Workers & Pages → D1 → دیتابیس واقعی تست → Console**.
3. محتوای همین `schema.sql` را در Console اجرا کن.
4. سپس سایت را باز کن:
   `https://thinkshopstore.ir/api/health`
5. همه جدول‌های Commerce باید `true` شوند.

این Schema به‌صورت additive نوشته شده:
- `products` و `settings` قبلی را حذف نمی‌کند.
- برای محصولات موجود، رکورد `inventory` با موجودی اولیه `0` می‌سازد تا موجودی جعلی ایجاد نشود.
- سبد، مشتری، سفارش، پرداخت و تاریخچه سفارش را اضافه می‌کند.

## نکته پرداخت

درگاه واقعی هنوز وصل نیست؛ جدول `payments` و فیلدهای لازم برای اتصال بعدی آماده هستند، اما پرداخت موفق جعلی ثبت نمی‌شود.
