# Sats Vault 🪙⚡

Discord bot ให้เพื่อน ๆ `/tip` และ `/rain` sats กันเล่น ๆ ในกลุ่ม โดยใช้ **LNbits wallet เดียว** เป็น treasury
และเก็บยอดของแต่ละคนไว้เป็น "internal ledger" ใน SQLite — โอนกันในกลุ่มไม่มีค่าธรรมเนียม ไม่ต้องรอ confirm
ส่วน `/deposit` และ `/withdraw` ค่อยคุยกับ Lightning Network จริงตอนเงินเข้า-ออกจากวงเพื่อน

## คำสั่งทั้งหมด

| คำสั่ง | คำอธิบาย |
|---|---|
| `/join` | เริ่มมียอด sats ของตัวเอง (ยอดเริ่มต้น 0) |
| `/balance` | เช็คยอดของตัวเอง |
| `/deposit amount:<sats>` | สร้าง invoice เติมเงินเข้า Vault พร้อม QR code |
| `/withdraw destination:<bolt11 หรือ LN address> amount:<sats, จำเป็นเฉพาะตอนใส่ LN address>` | ถอน sats ไปยัง BOLT11 invoice (อ่านจำนวนจาก invoice อัตโนมัติ) หรือ Lightning Address (ต้องระบุ `amount` เอง) — หักค่าธรรมเนียมสำรอง 1% เพิ่มจากยอดถอน (ขั้นต่ำ 1 sat) |
| `/tip user:<@คน> amount:<sats>` | ส่ง sats ให้เพื่อนฟรี ไม่มีค่าธรรมเนียม |
| `/rain amount:<sats>` | หว่านจากยอดตัวเอง แบ่งเท่า ๆ กันให้ทุกคนที่ `/join` แล้ว |
| `/leaderboard` | อันดับคนรวย sats สุดในกลุ่ม |

## เตรียม LNbits

1. เปิด instance LNbits ของคุณ (self-host หรือ https://legend.lnbits.com สำหรับทดลองเล่น — **อย่าใช้ legend.lnbits.com กับเงินจริงจำนวนมาก**)
2. สร้าง wallet ใหม่ ตั้งชื่อว่า `Sats Vault Treasury`
3. เปิดหน้า wallet นั้น กด **API info** จะเห็น 2 คีย์:
   - **Admin key** → ใช้จ่ายเงินออก (`LNBITS_ADMIN_KEY`)
   - **Invoice/read key** → ใช้สร้าง invoice/เช็คสถานะ (`LNBITS_INVOICE_KEY`)
4. เติมเงินเข้า wallet นี้ไว้ล่วงหน้าสักก้อน เพื่อไว้จ่าย `/withdraw` ให้เพื่อน ๆ (การ deposit ของ user แต่ละคนจะเข้ามาสมทบในนี้ด้วย)

⚠️ **Admin key คือกุญแจสำคัญ** เก็บไว้ใน `.env` เท่านั้น อย่า commit ขึ้น git หรือแชร์ให้ใครเห็น
เพราะใครมี admin key คนนั้นสามารถโอนเงินออกจาก treasury ทั้งหมดได้

## เตรียม Discord Bot

1. ไปที่ https://discord.com/developers/applications สร้าง Application ใหม่
2. แท็บ **Bot** → กด Reset Token คัดลอกมาใส่ `DISCORD_TOKEN`
3. แท็บ **General Information** → คัดลอก Application ID มาใส่ `DISCORD_CLIENT_ID`
4. แท็บ **OAuth2 → URL Generator** → เลือก scope `bot` + `applications.commands`
   permission ที่ต้องใช้: `Send Messages`, `Attach Files`, `Use Slash Commands`
5. เปิดลิงก์ที่ได้เพื่อเชิญบอทเข้าเซิร์ฟเวอร์
6. (แนะนำตอน dev) คลิกขวาที่ชื่อเซิร์ฟเวอร์ในแอป Discord (เปิด Developer Mode ก่อนใน Settings) → Copy Server ID → ใส่ `DISCORD_GUILD_ID` เพื่อให้ slash command ขึ้นทันทีเฉพาะเซิร์ฟเวอร์นี้ (ถ้าไม่ใส่จะเป็น global ใช้เวลาราว 1 ชม. กว่าจะ sync) — ใส่ได้หลายเซิร์ฟเวอร์พร้อมกันโดยคั่นด้วยจุลภาค เช่น `111,222,333`

## ติดตั้งและรัน

```bash
cp .env.example .env
# แก้ .env ให้ครบตามหัวข้อด้านบน

pnpm install
pnpm register   # ลงทะเบียน slash commands กับ Discord (รันครั้งเดียว หรือทุกครั้งที่แก้คำสั่ง)
pnpm start       # เปิดบอท
```

## หมายเหตุเรื่องความถูกต้องของเลดเจอร์

- ยอดของแต่ละคนแยกเป็น **ต่อเซิร์ฟเวอร์** — คนเดียวกันที่อยู่หลายเซิร์ฟเวอร์จะมียอด sats คนละก้อนกันในแต่ละที่ (ไม่ปนกัน)
- ยอดสรุปของทุกคนรวมกัน (ในทุกเซิร์ฟเวอร์) **ควรจะ ≤** ยอดจริงใน treasury wallet เสมอ — `/withdraw` หักค่าธรรมเนียมสำรอง 1% (ขั้นต่ำ 1 sat) เพิ่มจากยอดถอนทุกครั้งเพื่อกันไว้เป็น buffer ของ routing fee จริง โดยหักคงที่ไม่คืนส่วนต่างแม้ routing fee จริงจะถูกกว่า 1% ที่หักไว้
- `/withdraw` จ่าย invoice จริงก่อน แล้วค่อยหักยอด internal (ยอดถอน + ค่าธรรมเนียม) — ถ้าบอทล่มระหว่างสองสเต็ปนี้พอดี (โอกาสน้อยมาก) treasury จะขาดทุนเล็กน้อย แต่จะไม่มีทางที่ user หักยอดไปแล้วไม่ได้เงินจริง (fail-safe ไปทางฝั่งที่ปลอดภัยกว่า)
- ไฟล์ `vault.db` (SQLite) คือฐานข้อมูลทั้งหมด สำรองไว้เป็นระยะถ้าจะรันจริงจัง

> ⚠️ **ถ้าคุณเคยรันเวอร์ชันก่อนหน้า** (ที่ยังไม่แยกยอดต่อเซิร์ฟเวอร์) แล้วมี `vault.db` เก่าอยู่ ต้องลบทิ้งก่อนรันเวอร์ชันนี้ (schema เปลี่ยน) — ถ้ายังไม่มีข้อมูลจริงในนั้น (แค่ทดสอบ) ลบทิ้งได้เลยไม่มีปัญหา

## ต่อยอดได้อีก

- เพิ่ม cooldown กัน spam `/tip`
- ใช้ Discord embed แทน plain text ให้สวยขึ้น
- เพิ่มคำสั่ง `/history` ดึงจากตาราง `ledger_log`
- ทำ role พิเศษให้คนอันดับ 1 ใน leaderboard
