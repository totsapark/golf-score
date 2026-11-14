# ⛳ Golf Live

แอปจดสกอร์กอล์ฟแบบออนไลน์ ทุกคนจดของตัวเองบนมือถือ แล้วดูคะแนนกันแบบสด

**เปิดแอป:** https://totsapark.github.io/golf-score/

## ความสามารถ
- สร้างแก๊ง → ได้ QR + รหัส 6 ตัว + PIN 4 หลัก เพื่อนสแกนแล้วเลือกชื่อตัวเอง
- จดสกอร์ของตัวเอง: ตีถึงออน, พัตต์, Tee-off, ลูกโทษ, บังเกอร์ (คนสร้างแก๊งจดแทนได้)
- Dashboard สด: ใครอยู่หลุมไหน, leaderboard, ความเคลื่อนไหวล่าสุด, สกอร์การ์ดสด
- กินตัง: ทุกหลุมที่ทุกคนจดครบ 2 อันดับสุดท้ายเสีย + สุ่มอีก 1 อันดับจากทุกคน (หรือเลือกแบบสุ่ม 3 อันดับ) ตั้งเงินแต่ละช่องได้
- แผนที่สด: เห็นทุกคนเป็นจุดสีบนสนามแบบ realtime (ส่งตำแหน่งทุก ~5 วินาทีเมื่อขยับ)
- บันทึกช็อต: กดตอนตี เลือกไม้ D / FW / HY / Iron / Wedge / Putter (ระบุเบอร์ได้)
- แผนที่สนาม: ภาพดาวเทียม + กรีน/บังเกอร์/น้ำจาก OpenStreetMap, ระยะถึงกรีน (หน้า/กลาง/หลัง), บันทึกช็อตด้วย GPS → ระยะเฉลี่ยแต่ละไม้
- สรุปผล, รางวัล, Gross/Net, Handicap (WHS), รูปสกอร์การ์ด, ประวัติ

## ตั้งค่า Firebase (ครั้งเดียว)
1. https://console.firebase.google.com → Add project
2. Build → **Authentication** → Get started → Sign-in method → เปิด **Anonymous**
3. Build → **Realtime Database** → Create database → เลือก **Singapore (asia-southeast1)** → Start in **locked mode**
4. แท็บ Rules → วางเนื้อหาไฟล์ `database.rules.json` → Publish
5. Project settings → Your apps → Web (`</>`) → Register app → คัดลอก `firebaseConfig` ใส่ใน `config.js`

ทดสอบโดยไม่ต้องมี Firebase: เปิด `?mock=1` (ข้อมูลอยู่ในเบราว์เซอร์เครื่องเดียว)
