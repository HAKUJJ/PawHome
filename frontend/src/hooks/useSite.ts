// =========================================================
// ค่าตั้งของเว็บ · แจ้งเตือนในเว็บ
// แจ้งเตือนอยู่ใต้ ["me", ...] → ออกจากระบบแล้วถูกล้างพร้อมข้อมูลส่วนตัวอื่น (removeQueries ["me"])
// =========================================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotifications, getSiteConfig, markAllNotificationsRead, markNotificationRead } from "../api/site";
import { useAuthStore } from "../stores/useAuthStore";
import { toast } from "../stores/useToastStore";

export const siteKeys = {
  config: ["site", "config"] as const,
  notifications: ["me", "notifications"] as const,
};

export function useSiteConfig() {
  return useQuery({ queryKey: siteKeys.config, queryFn: getSiteConfig, staleTime: 5 * 60_000 });
}

// ขั้นตอนส่งมอบเปิดอยู่ (ระหว่างโหลด/โหลดไม่สำเร็จ = ปิด เพื่อไม่แสดงปุ่มที่ Backend จะปฏิเสธ)
export function useHandoverEnabled() {
  return useSiteConfig().data?.adoptionHandoverWorkflow === true;
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: siteKeys.notifications,
    queryFn: getNotifications,
    enabled: user !== null,
    refetchInterval: 60_000, // ไม่ใช้ websocket: ดึงใหม่ทุกนาที + ตอนกลับมาที่แท็บ
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: siteKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: siteKeys.notifications }),
    onError: (error) => toast(error.message, "error"),
  });
}
