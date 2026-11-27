# แต่งตั้ง SUPER_ADMIN คนแรก (Bootstrap)

ใช้ครั้งเดียวต่อฐานข้อมูล · ไม่มี API แต่งตั้งผู้ดูแล (ผู้ดูแลเพิ่มเติม = เพิ่มแถวใน `admin_memberships` ด้วย SQL Editor โดยเจ้าของโปรเจกต์)

> ⚠️ รันกับ Production ได้เมื่อ migration 000–003 ผ่านแล้ว (`GET /api/ready` = 200) และเจ้าของโปรเจกต์อนุมัติบัญชีเป้าหมาย
> สคริปต์ **ไม่มี** API ให้เรียก และ **ไม่** รันตอน server เริ่ม

## ก่อนรัน

1. รัน `database/migrations/001_admin_workflow.sql` แล้ว (ต้องมีตาราง `admin_memberships`)
2. ผู้ที่จะเป็นผู้ดูแล **สมัครและยืนยันอีเมลใน PawHome เองแล้ว**
3. ดู UUID ของบัญชีนั้นใน Supabase Dashboard → Authentication → Users → คอลัมน์ UID
   - ห้ามเดา และห้ามคัดลอกจากบัญชีอื่น
4. `backend/.env` ชี้ไปฐานข้อมูลที่ตั้งใจจริง

## รัน

```bash
cd backend
npm run admin:bootstrap -- --user <UUID>
# สคริปต์แสดง "ฐานข้อมูลเป้าหมาย: <host>" แล้วหยุด → ตรวจว่าเป็นฐานข้อมูลที่ตั้งใจ แล้วรันอีกครั้งพร้อมยืนยัน:
npm run admin:bootstrap -- --user <UUID> --confirm-host <host ที่แสดง>
```

## สิ่งที่สคริปต์ตรวจ

| ตรวจ | ผลเมื่อไม่ผ่าน |
| --- | --- |
| `--user` เป็น UUID | หยุด |
| `--confirm-host` ตรงกับ host ของ `DATABASE_URL` | หยุด (exit 2) · ไม่เชื่อมต่อฐานข้อมูล |
| บัญชีมีอยู่ใน `auth.users` และ `profiles` | หยุด |
| ไม่ใช่บัญชี demo `@pawhome.test` | หยุด · ยกเว้นใส่ `--allow-demo` (ใช้กับฐานข้อมูล dev/test เท่านั้น) |
| ยังไม่มี SUPER_ADMIN | หยุด |

ผ่านทุกข้อ → เพิ่มแถว `admin_memberships (role = SUPER_ADMIN)` ใน transaction เดียว

## ตรวจผล

```sql
select user_id, role, created_at from public.admin_memberships;
```

แล้วเข้าสู่ระบบด้วยบัญชีนั้นที่ `/admin`

## ยกเลิก

ใช้ SQL Editor เท่านั้น (ไม่มี API ถอดสิทธิ์):

```sql
delete from public.admin_memberships where user_id = '<UUID>';
```


ทดสอบอัตโนมัติ: `backend/tests/bootstrap.test.ts`
