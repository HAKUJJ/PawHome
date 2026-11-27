-- ลบเฉพาะชุดข้อมูลสาธิตขนาดเล็ก pawhome-demo-minimal-v1 (ไม่ใช้ TRUNCATE · ไม่แตะข้อมูลอื่น)
-- คำขอ ไทม์ไลน์ รายงาน บันทึกติดตาม แจ้งเตือน รายการโปรด ถูกลบตาม FK (on delete cascade) ของน้อง
-- ไม่ลบ: admin_audit_logs (append-only โดยออกแบบ — แยกด้วย changes.dataset) และบัญชีใน Supabase Auth
begin;
do $$
begin
  if exists (select 1 from public.pets p join auth.users u on u.id = p.owner_id where u.email not like '%@pawhome.test') then
    raise exception 'พบข้อมูลของผู้ใช้จริง — ไม่รัน cleanup บนฐานข้อมูลนี้';
  end if;
end $$;
delete from public.pets p using auth.users u
where p.owner_id = u.id and u.email like 'mini-0_.%@pawhome.test' and p.id between 2201 and 2210;
delete from public.announcements a using auth.users u
where a.created_by = u.id and u.email like 'mini-0_.%@pawhome.test' and a.id between 601 and 603;
delete from public.admin_memberships m using auth.users u where m.user_id = u.id and u.email like 'mini-0_.%@pawhome.test';
commit;
