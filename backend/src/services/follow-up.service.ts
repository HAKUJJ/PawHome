// นโยบายติดตามคำขอที่เจ้าของเงียบ (ชั่วโมง) · ใช้คำนวณความเร่งด่วนสดในคิวผู้ดูแล (ไม่มีงานตามเวลา)
import { env } from "../config/env.js";
import type { FollowUpPolicy } from "./adoption-workflow.js";

export const followUpPolicy: FollowUpPolicy = {
  reminderHours: env.FOLLOW_UP_REMINDER_HOURS,
  adminHours: env.FOLLOW_UP_ADMIN_HOURS,
  escalationHours: env.FOLLOW_UP_ESCALATION_HOURS,
};
