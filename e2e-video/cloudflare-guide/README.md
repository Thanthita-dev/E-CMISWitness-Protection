# เผยแพร่คู่มือภาพหน้าจอ demo (Cloudflare Worker)

Worker `ecmis-witness-guide` เสิร์ฟคู่มือสาธิต ก6 (เรื่อง WP-2569-000612 · ตรีรุด หล่อจัง) เป็น static assets ล้วน: `index.html` และภาพหน้าจอ `<เส้นทาง>/*.jpg` กับ `guide.json` ของเส้นทางหลัก / ทางแยกข้อ 14 / ทางแยกอุทธรณ์ แยกจาก Worker วิดีโอนำเสนอ (`../cloudflare/`)

## ใช้งาน

1. ครั้งแรกครั้งเดียว: `wrangler login`
2. สร้างคู่มือ: `pnpm guide` (ถ่ายภาพใหม่) หรือ `pnpm guide:build` (สร้างหน้าเว็บจากภาพเดิม)
3. จากโฟลเดอร์ `witness-protection/` รัน

```bash
pnpm deploy:guide
```

คำสั่งนี้รัน `node e2e-video/cloudflare-guide/deploy.mjs` ซึ่งคัดลอก `../output-guide` ลง `public/` แล้ว `wrangler deploy` (`--dry-run` ดูแผนก่อน)

`public/` และ `.wrangler/` เป็นไฟล์ที่สร้างอัตโนมัติ ไม่ commit
