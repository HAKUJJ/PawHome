// /api/admin/* — ทุก route: requireAuth (token Supabase) → requireAdmin (admin_memberships) → requirePermission
// หน้า Admin ฝั่ง frontend มี guard แค่เพื่อ UX · ความปลอดภัยจริงอยู่ที่นี่
import { Router } from "express";
import { adminController as c } from "../controllers/admin.controller.js";
import { requireAdmin, requirePermission as can } from "../middleware/admin.js";
import { requireAuth } from "../middleware/auth.js";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/me", c.me);
adminRoutes.get("/dashboard", can("dashboard.read"), c.dashboard);

adminRoutes.get("/pets", can("pets.read"), c.listPets);
adminRoutes.get("/pets/:id", can("pets.read"), c.getPet);
adminRoutes.patch("/pets/:id", can("pets.moderate"), c.updatePet);
adminRoutes.post("/pets/:id/moderation", can("pets.moderate"), c.moderatePet);

adminRoutes.get("/adoptions", can("adoptions.read"), c.listCases);
adminRoutes.get("/adoptions/:id", can("adoptions.read"), c.getCase);
adminRoutes.get("/adoptions/:id/timeline", can("adoptions.read"), c.timeline);
adminRoutes.post("/adoptions/:id/follow-ups", can("adoptions.follow_up"), c.followUp);
adminRoutes.post("/adoptions/:id/review-handover", can("adoptions.resolve"), c.reviewHandover);
adminRoutes.post("/adoptions/:id/close", can("adoptions.resolve"), c.closeCase);

adminRoutes.get("/users", can("users.read"), c.listUsers);
adminRoutes.get("/users/:id", can("users.read"), c.getUser);

adminRoutes.get("/announcements", can("announcements.manage"), c.listAnnouncements);
adminRoutes.post("/announcements", can("announcements.manage"), c.createAnnouncement);
adminRoutes.patch("/announcements/:id", can("announcements.manage"), c.updateAnnouncement);
adminRoutes.delete("/announcements/:id", can("announcements.manage"), c.deleteAnnouncement);

