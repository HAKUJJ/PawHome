// =========================================================
// คำขอรับเลี้ยง
// ทุกครั้งที่คำขอเปลี่ยน สถานะน้องก็เปลี่ยนตาม (รอบ้าน / มีคนขอรับเลี้ยง / ได้บ้านแล้ว)
// เลยต้อง invalidate ทั้ง ["pets"] และ ["me"]
// =========================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  arrangeHandover,
  confirmHandover,
  disputeHandover,
  getAdoptionTimeline,
  reportHandover,
  cancelAdoption,
  createAdoption,
  getMyAdoptions,
  getPetAdoptions,
  reviewAdoption,
  type ReviewStatus,
} from "../api/adoptions";
import { useAuthStore } from "../stores/useAuthStore";
import { toast } from "../stores/useToastStore";
import type { AdoptionInput, HandoverInput } from "../types/adoption";

export const adoptionKeys = {
  mine: ["me", "adoptions"] as const,
  ofPet: (petId: number) => ["pets", "adoptions", petId] as const,
  timeline: (id: number) => ["me", "adoptions", "timeline", id] as const,
};

export function useAdoptionTimeline(id: number, enabled: boolean) {
  return useQuery({ queryKey: adoptionKeys.timeline(id), queryFn: ({ signal }) => getAdoptionTimeline(id, signal), enabled });
}

export function useMyAdoptions() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: adoptionKeys.mine,
    queryFn: getMyAdoptions,
    enabled: user !== null,
  });
}

// คำขอทั้งหมดของน้อง 1 ตัว ใช้เฉพาะเจ้าของโพสต์ (enabled = false ถ้าไม่ใช่เจ้าของ)
export function usePetAdoptions(petId: number, enabled: boolean) {
  return useQuery({
    queryKey: adoptionKeys.ofPet(petId),
    queryFn: ({ signal }) => getPetAdoptions(petId, signal),
    enabled,
  });
}

function useRefreshAdoptions() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["pets"] }),
      queryClient.invalidateQueries({ queryKey: ["me"] }),
    ]);
}

export function useCreateAdoption(petId: number) {
  const refresh = useRefreshAdoptions();
  return useMutation({
    mutationFn: (input: AdoptionInput) => createAdoption(petId, input),
    onSuccess: () => {
      toast("ส่งคำขอรับเลี้ยงแล้ว รอผู้โพสต์ติดต่อกลับนะ");
      return refresh();
    },
  });
}

export function useCancelAdoption() {
  const refresh = useRefreshAdoptions();
  return useMutation({
    mutationFn: (id: number) => cancelAdoption(id),
    onSuccess: () => {
      toast("ยกเลิกคำขอแล้ว", "info");
      return refresh();
    },
    onError: (error) => toast(error.message, "error"),
  });
}

export function useReviewAdoption() {
  const refresh = useRefreshAdoptions();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReviewStatus }) => reviewAdoption(id, status),
    onSuccess: (data, { status }) => {
      // ขั้นตอนส่งมอบ: ตอบรับ ≠ ได้บ้านแล้ว · โหมดเดิม: อนุมัติ = ได้บ้านแล้ว
      const accepted = data?.stage === "ACCEPTED" && !data.legacyReview;
      toast(status === "REJECTED" ? "บันทึกว่าไม่ผ่านแล้ว" : accepted ? "ตอบรับแล้ว ขั้นต่อไปคือนัดส่งมอบน้อง" : "อนุมัติแล้ว น้องได้บ้านแล้ว", status === "APPROVED" ? "success" : "info");
      return refresh();
    },
    onError: (error) => toast(error.message, "error"),
  });
}

// การกระทำในขั้นตอนส่งมอบ: เรียก Backend แล้วโหลดคำขอ/สถานะน้องใหม่ (Backend ตรวจสิทธิ์และขั้นเดิมทุกครั้ง)
function useHandoverAction<T>(run: (input: T) => Promise<unknown>, message: string) {
  const refresh = useRefreshAdoptions();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      toast(message);
      return refresh();
    },
    onError: (error) => toast(error.message, "error"),
  });
}
export const useArrangeHandover = () => useHandoverAction((id: number) => arrangeHandover(id), "เริ่มนัดส่งมอบแล้ว");
export const useReportHandover = () =>
  useHandoverAction(({ id, input }: { id: number; input: HandoverInput }) => reportHandover(id, input), "บันทึกรายงานส่งมอบแล้ว");
export const useConfirmHandover = () => useHandoverAction((id: number) => confirmHandover(id), "ยืนยันรายละเอียดการส่งมอบแล้ว");
export const useDisputeHandover = () =>
  useHandoverAction(({ id, note }: { id: number; note: string }) => disputeHandover(id, note), "แจ้งปัญหาแล้ว ผู้ดูแลจะช่วยตรวจสอบ");
