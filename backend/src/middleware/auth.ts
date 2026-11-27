import type { RequestHandler, Response } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { profilesRepository } from "../repositories/profiles.repository.js";
import type { User } from "../types/dto.js";
import { ApiError } from "./error.js";

const bearer = (header: string | undefined) => (header?.startsWith("Bearer ") ? header.slice(7).trim() : "");

// ยืนยัน token กับ Supabase Auth แล้วโหลด profile · บัญชีที่ถูกผู้ดูแลระงับใช้งานไม่ได้
// shortcut: getUser() ยิงไป Supabase ทุก request, ถ้าโหลดสูงเปลี่ยนเป็น auth.getClaims() ที่ตรวจ JWT ในเครื่องด้วย JWKS
async function authenticate(token: string, res: Response) {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");

  const profile = await profilesRepository.findWithSuspension(data.user.id);
  if (!profile) throw new ApiError(401, "ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
  if (profile.suspension) throw new ApiError(403, "บัญชีนี้ถูกระงับการใช้งาน หากคิดว่าผิดพลาดกรุณาติดต่อทีมงาน");

  res.locals.user = { id: profile.id, name: profile.name, email: data.user.email ?? "" } satisfies User;
  res.locals.token = token;
}

// อ่าน "Authorization: Bearer <access token ของ Supabase>"
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = bearer(req.headers.authorization);
  if (!token) throw new ApiError(401, "กรุณาเข้าสู่ระบบก่อน");
  await authenticate(token, res);
  next();
};

// route สาธารณะที่เจ้าของเห็นข้อมูลเพิ่ม (เช่นโพสต์ที่ถูกซ่อน) · ไม่มี token = ผู้เยี่ยมชม · token ผิด = 401 เหมือนเดิม
export const optionalAuth: RequestHandler = async (req, res, next) => {
  const token = bearer(req.headers.authorization);
  if (token) await authenticate(token, res);
  next();
};

// ใช้ใน controller ที่อยู่หลัง requireAuth
export const currentUser = (res: Response): User => res.locals.user as User;
export const currentToken = (res: Response): string => res.locals.token as string;
export const optionalUser = (res: Response): User | undefined => res.locals.user as User | undefined;
