// =========================================================
// อัปโหลดรูป (ต้องล็อกอิน)
//   POST /uploads   multipart/form-data ช่องชื่อ "image"  → { url: "https://..." }
// Backend ใช้ multer รับไฟล์ แล้วเก็บไว้ (โฟลเดอร์ uploads/ หรือ Cloudinary / Supabase Storage)
// แล้วตอบลิงก์รูปกลับมา หน้าเว็บเอาลิงก์นั้นไปใส่ imageUrl ของน้อง
// =========================================================

import { request } from "./client";

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("image", file);
  const result = await request<{ url: string }>("/uploads", { method: "POST", body });
  return result.url;
}
