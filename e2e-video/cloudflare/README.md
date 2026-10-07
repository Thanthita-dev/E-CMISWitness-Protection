# เผยแพร่วิดีโอนำเสนอ (Cloudflare Worker)

Worker เสิร์ฟหน้านำเสนอ ก6 สาธารณะ: หน้า `index.html` และไฟล์คำบรรยาย (`*.vtt`, `*.srt`, `*.chapters.txt`, `*.meta.json`) ขึ้นเป็น static assets ส่วนวิดีโอ `.mp4` เก็บใน R2 bucket `ecmis-witness-presentation-videos` และ Worker เสิร์ฟพร้อมรองรับ HTTP Range (กรอกเวลา/เลื่อนวิดีโอได้)

## ใช้งาน

1. ครั้งแรกครั้งเดียว: `wrangler login`
2. จากโฟลเดอร์ `witness-protection/` รัน

```bash
npm run deploy:presentation
```

คำสั่งนี้รัน `node e2e-video/cloudflare/deploy.mjs` ซึ่งคัดลอกไฟล์จาก `../output-presentation` ลง `public/`, อัปโหลดวิดีโอขึ้น R2 แล้ว deploy Worker

`public/`, `.wrangler/` และ `.upload-manifest.json` เป็นไฟล์ที่สร้างอัตโนมัติ ไม่ commit
