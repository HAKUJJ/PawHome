// =========================================================
// ข้อมูลประกอบหน้าเว็บจาก Backend รุ่นใหม่ (ทนต่อ Backend รุ่นเดิมที่ยังไม่มี endpoint เหล่านี้)
//   GET   /config                       ขั้นตอนส่งมอบเปิดอยู่ไหม
//   GET   /me/notifications             แจ้งเตือนในเว็บของฉัน + จำนวนที่ยังไม่อ่าน
//   PATCH /me/notifications/:id/read    อ่านแล้ว 1 รายการ
//   POST  /me/notifications/read-all    อ่านแล้วทั้งหมด
// =========================================================
import { ApiError, request } from "./client";

export interface SiteConfig {
  adoptionHandoverWorkflow: boolean;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  requestId: number | null;
  petId: number | null;
  link: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationList {
  unread: number;
  items: NotificationItem[];
}

// Backend รุ่นเดิมตอบ 404 → ถือว่ายังไม่มีฟีเจอร์ (ไม่ใช่ error ของผู้ใช้)
const missing = (error: unknown) => error instanceof ApiError && error.status === 404;

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    return await request<SiteConfig>("/config");
  } catch (error) {
    if (missing(error)) return { adoptionHandoverWorkflow: false };
    throw error;
  }
}

export async function getNotifications(): Promise<NotificationList> {
  try {
    return await request<NotificationList>("/me/notifications");
  } catch (error) {
    if (missing(error)) return { unread: 0, items: [] };
    throw error;
  }
}

export const markNotificationRead = (id: string) => request<void>(`/me/notifications/${id}/read`, { method: "PATCH" });
export const markAllNotificationsRead = () => request<{ updated: number }>("/me/notifications/read-all", { method: "POST" });
