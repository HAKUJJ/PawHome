import { z } from "zod";

// กฎเดียวกับ AdoptionForm ใน frontend/src/components/AdoptionPanel.tsx
export const adoptionInputSchema = z.object({
  phone: z
    .string({ required_error: "กรุณากรอกเบอร์โทร" })
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^0\d{8,9}$/.test(v), "เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก"),
  housing: z.enum(["HOUSE", "CONDO", "DORM"], { errorMap: () => ({ message: "กรุณาเลือกที่พักอาศัย" }) }),
  message: z.string({ required_error: "กรุณาแนะนำตัว" }).trim().min(20, "เล่าเกี่ยวกับตัวคุณอย่างน้อย 20 ตัวอักษร").max(2000, "ข้อความยาวเกิน 2000 ตัวอักษร"),
});

export const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], { errorMap: () => ({ message: "status ต้องเป็น APPROVED หรือ REJECTED" }) }),
});

// วันที่ส่งมอบ YYYY-MM-DD (วันที่จริงในปฏิทิน ไม่เกินวันนี้ +1 เผื่อเขตเวลา)
const handoverDate = z
  .string({ required_error: "กรุณาระบุวันที่ส่งมอบ" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD")
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "วันที่ไม่ถูกต้อง")
  .refine((d) => d.getTime() <= Date.now() + 86_400_000, "วันที่ส่งมอบต้องไม่อยู่ในอนาคต");

export const handoverReportSchema = z.object({
  handoverDate,
  outcome: z.enum(["HANDED_OVER", "NOT_HANDED_OVER"], { errorMap: () => ({ message: "outcome ต้องเป็น HANDED_OVER หรือ NOT_HANDED_OVER" }) }),
  note: z.string().trim().max(1000, "บันทึกยาวเกิน 1000 ตัวอักษร").default(""),
  // หลักฐานต้องเป็นรูปที่อัปโหลดผ่าน /api/uploads (ตรวจโดเมนใน service ไม่ได้ เพราะ bucket อยู่ใน env) — จำกัดเป็น https
  evidenceUrl: z.string().trim().max(2048).refine((v) => v === "" || v.startsWith("https://"), "ลิงก์หลักฐานต้องเป็น https").default(""),
});

export const disputeSchema = z.object({
  note: z.string({ required_error: "กรุณาอธิบายปัญหา" }).trim().min(5, "อธิบายปัญหาอย่างน้อย 5 ตัวอักษร").max(1000),
});

export type AdoptionInput = z.infer<typeof adoptionInputSchema>;
export type ReviewStatus = z.infer<typeof reviewSchema>["status"];
export type HandoverReportInput = z.infer<typeof handoverReportSchema>;
export type DisputeInput = z.infer<typeof disputeSchema>;
