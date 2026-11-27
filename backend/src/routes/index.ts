// รายชื่อ route ทั้งหมด (อยู่ใต้ /api) — ตรงกับ frontend/src/api/*.ts และ docs/backend-api.md
import { Router } from "express";
import { adoptionsController } from "../controllers/adoptions.controller.js";
import { authController } from "../controllers/auth.controller.js";
import { favoritesController } from "../controllers/favorites.controller.js";
import { petsController } from "../controllers/pets.controller.js";
import { uploadsController } from "../controllers/uploads.controller.js";
import { env } from "../config/env.js";
import { currentUser, optionalAuth, requireAuth } from "../middleware/auth.js";
import { followUpPolicy } from "../services/follow-up.service.js";
import { notificationsService } from "../services/notifications.service.js";
import { z } from "zod";
import { ApiError } from "../middleware/error.js";
import { adminRoutes } from "./admin.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { uploadImage } from "../middleware/upload.js";

export const routes = Router();

// ---- Auth ----
routes.post("/auth/register", rateLimit("สมัครสมาชิก", env.RATE_LIMIT_REGISTER_PER_MINUTE), authController.register);
routes.post("/auth/login", rateLimit("เข้าสู่ระบบ", env.RATE_LIMIT_LOGIN_PER_MINUTE), authController.login);
// ไม่ต้องมี access token (อาจหมดอายุไปแล้ว) ใช้ refresh token แทน
routes.post("/auth/refresh", rateLimit("ต่ออายุการเข้าสู่ระบบ", env.RATE_LIMIT_REFRESH_PER_MINUTE), authController.refresh);
routes.get("/auth/me", requireAuth, authController.me);
routes.post("/auth/logout", requireAuth, authController.logout);

// ---- Pets ----
routes.get("/pets", petsController.list);
routes.get("/pets/:id", optionalAuth, petsController.get); // เจ้าของเห็นโพสต์ที่ถูกซ่อนของตัวเอง
routes.post("/pets", requireAuth, petsController.create);
routes.put("/pets/:id", requireAuth, petsController.update);
routes.delete("/pets/:id", requireAuth, petsController.remove);

// ---- ของฉัน ----
routes.get("/me/pets", requireAuth, petsController.listMine);
routes.get("/me/favorites", requireAuth, favoritesController.list);
routes.post("/me/favorites", requireAuth, favoritesController.add);
routes.delete("/me/favorites/:petId", requireAuth, favoritesController.remove);
routes.get("/me/adoptions", requireAuth, adoptionsController.listMine);
routes.patch("/me/profile", requireAuth, authController.updateProfile);
// แจ้งเตือนในเว็บของผู้ใช้ที่ล็อกอิน (เห็นเฉพาะของตัวเอง)
routes.get("/me/notifications", requireAuth, async (_req, res) => {
  res.json(await notificationsService.listForUser(currentUser(res).id));
});
routes.post("/me/notifications/read-all", requireAuth, async (_req, res) => {
  res.json(await notificationsService.markAllRead(currentUser(res).id));
});
routes.patch("/me/notifications/:id/read", requireAuth, async (req, res) => {
  const id = z.string().regex(/^[0-9]{1,18}$/).safeParse(req.params.id);
  if (!id.success) throw new ApiError(404, "ไม่พบการแจ้งเตือน");
  await notificationsService.markRead(currentUser(res).id, BigInt(id.data));
  res.status(204).end();
});

// ---- คำขอรับเลี้ยง ----
routes.post("/pets/:id/adoptions", requireAuth, adoptionsController.create);
routes.get("/pets/:id/adoptions", requireAuth, adoptionsController.listForPet);
routes.delete("/adoptions/:id", requireAuth, adoptionsController.cancel);
routes.get("/adoptions/:id", requireAuth, adoptionsController.get);
routes.get("/adoptions/:id/timeline", requireAuth, adoptionsController.timeline);
routes.patch("/adoptions/:id", requireAuth, adoptionsController.review);
// ขั้นตอนส่งมอบ (เปิดเมื่อ ADOPTION_HANDOVER_WORKFLOW=true)
routes.post("/adoptions/:id/arrange", requireAuth, adoptionsController.arrange);
routes.post("/adoptions/:id/handover-reports", requireAuth, adoptionsController.report);
routes.post("/adoptions/:id/confirm", requireAuth, adoptionsController.confirm);
routes.post("/adoptions/:id/dispute", requireAuth, adoptionsController.dispute);

// ---- ค่าตั้งที่หน้าเว็บต้องรู้ (ไม่มีความลับ) ----
routes.get("/config", (_req, res) => {
  res.json({ adoptionHandoverWorkflow: env.ADOPTION_HANDOVER_WORKFLOW, followUp: followUpPolicy });
});

// ---- ผู้ดูแล ----
routes.use("/admin", adminRoutes);


// ---- อัปโหลดรูป ----
routes.post("/uploads", requireAuth, uploadImage, uploadsController.create);
