import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../middleware/error.js";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// ตรวจไบต์หัวไฟล์จริง ไม่เชื่อแค่ Content-Type ที่ browser ส่งมา
export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// ไฟล์ใน bucket ของเราที่ผู้ใช้คนนี้อัปโหลดเอง (path ขึ้นต้นด้วย userId/ ตาม uploadPetImage) — กันอ้างไฟล์ของคนอื่นหรือโดเมนภายนอก
export function isOwnUpload(url: string, userId: string): boolean {
  const prefix = supabaseAdmin.storage.from(env.STORAGE_BUCKET).getPublicUrl(`${userId}/`).data.publicUrl;
  return url.startsWith(prefix) && /^[\w-]+\.(jpg|png|webp)$/.test(url.slice(prefix.length));
}

// ลบรูปเดิมใน Storage เมื่อเจ้าของเปลี่ยนรูป/ลบโพสต์ · ลบเฉพาะไฟล์ในโฟลเดอร์ของผู้ใช้คนนั้น (รูปภายนอก/ของคนอื่นไม่แตะ)
// ลบไม่สำเร็จ = ไฟล์ค้างใน bucket เท่านั้น ข้อมูลในฐานข้อมูลบันทึกไปแล้ว จึงไม่ทำให้ request ล้ม
export async function removeOwnUpload(url: string, userId: string): Promise<void> {
  if (!url || !isOwnUpload(url, userId)) return;
  const bucket = supabaseAdmin.storage.from(env.STORAGE_BUCKET);
  const path = url.slice(bucket.getPublicUrl("").data.publicUrl.length);
  const { error } = await bucket.remove([path]);
  if (error) console.error("storage remove:", error.message);
}

export const uploadsService = {
  async uploadPetImage(userId: string, file: Express.Multer.File | undefined): Promise<{ url: string }> {
    if (!file) throw new ApiError(400, "กรุณาเลือกรูป (ช่องชื่อ image)");
    const type = detectImageType(file.buffer);
    if (!type) throw new ApiError(400, "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP");

    // แยกโฟลเดอร์ตามผู้ใช้ ชื่อไฟล์สุ่ม กันชนและกันเดาชื่อ
    const path = `${userId}/${randomUUID()}.${EXTENSIONS[type]}`;
    const bucket = supabaseAdmin.storage.from(env.STORAGE_BUCKET);
    const { error } = await bucket.upload(path, file.buffer, { contentType: type, upsert: false });
    if (error) {
      console.error("storage upload:", error.message);
      throw new ApiError(502, "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
    return { url: bucket.getPublicUrl(path).data.publicUrl };
  },
};
