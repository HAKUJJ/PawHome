import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { CONFIG_ERROR } from "./api/client";
import { router } from "./router";
import { useAuthStore } from "./stores/useAuthStore";
import "./index.css";

// QueryClient = ที่เก็บ cache ของข้อมูลจาก server ทั้งแอป
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // ข้อมูลถือว่ายังใหม่ 1 นาที ไม่ต้องยิง API ซ้ำทุกครั้งที่สลับหน้า
      retry: 1,
    },
  },
});

// คนล็อกอินเปลี่ยน (ล็อกอิน / ออก / สลับบัญชี — รวมถึงจากแท็บอื่น) → ล้างข้อมูล "ของฉัน" ของคนเก่า (queryKey ขึ้นต้นด้วย "me")
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) queryClient.removeQueries({ queryKey: ["me"] });
});

// ตั้งค่า deploy ไม่ครบ → แจ้งชัด ๆ แทนการแสดงหน้าเว็บที่โหลดอะไรไม่ได้ (หรือข้อมูลจำลอง)
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main role="alert" className="min-h-screen grid place-items-center p-6 bg-ground text-ink">
      <div className="max-w-md w-full bg-white rounded-2xl border border-danger/30 p-8 flex flex-col gap-3 text-center">
        <p className="font-semibold text-lg">ระบบยังไม่พร้อมใช้งาน</p>
        <p className="text-muted">{message}</p>
        <p className="text-sm text-muted">ผู้ดูแลระบบ: ตั้ง Environment Variable แล้ว Redeploy</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {CONFIG_ERROR ? (
      <ConfigErrorScreen message={CONFIG_ERROR} />
    ) : (
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )}
  </StrictMode>,
);
