import type { RequestHandler } from "express";
import { z } from "zod";
import { currentAdmin } from "../middleware/admin.js";
import { currentUser } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { adminAdoptionsService } from "../services/admin-adoptions.service.js";
import { adminService } from "../services/admin.service.js";
import { announcementsService } from "../services/announcements.service.js";
import {
  adminRoleSchema, announcementCreateSchema, announcementUpdateSchema, auditFiltersSchema, caseFiltersSchema, closeSchema,
  escalateSchema, followUpSchema, moderationSchema, petFiltersAdminSchema, petVisibilitySchema, reportRangeSchema,
  reviewHandoverSchema, suspendSchema, userFiltersSchema,
} from "../validators/admin.validator.js";
import { parseId } from "../validators/common.validator.js";

const petId = (v: unknown) => parseId(v, "ไม่พบโพสต์");
const caseId = (v: unknown) => parseId(v, "ไม่พบคำขอ");
const announcementId = (v: unknown) => parseId(v, "ไม่พบประกาศ");
function userId(v: unknown): string {
  const parsed = z.string().uuid().safeParse(v);
  if (!parsed.success) throw new ApiError(404, "ไม่พบผู้ใช้");
  return parsed.data;
}

type Handler = RequestHandler;

export const adminController = {
  me: (async (_req, res) => {
    res.json(adminService.me(currentUser(res), currentAdmin(res)));
  }) satisfies Handler,

  dashboard: (async (_req, res) => {
    res.json(await adminService.dashboard());
  }) satisfies Handler,

  // ---- โพสต์ ----
  listPets: (async (req, res) => {
    res.json(await adminService.listPets(petFiltersAdminSchema.parse(req.query)));
  }) satisfies Handler,
  getPet: (async (req, res) => {
    res.json(await adminService.getPet(petId(req.params.id)));
  }) satisfies Handler,
  updatePet: (async (req, res) => {
    const id = petId(req.params.id);
    const { visibility, reason } = petVisibilitySchema.parse(req.body);
    res.json(await adminService.setPetVisibility(currentAdmin(res), id, visibility, reason));
  }) satisfies Handler,
  moderatePet: (async (req, res) => {
    const id = petId(req.params.id);
    res.json(await adminService.moderatePet(currentAdmin(res), id, moderationSchema.parse(req.body)));
  }) satisfies Handler,

  // ---- คำขอรับเลี้ยง ----
  listCases: (async (req, res) => {
    res.json(await adminAdoptionsService.list(caseFiltersSchema.parse(req.query)));
  }) satisfies Handler,
  getCase: (async (req, res) => {
    res.json(await adminAdoptionsService.get(caseId(req.params.id)));
  }) satisfies Handler,
  timeline: (async (req, res) => {
    res.json(await adminAdoptionsService.timeline(caseId(req.params.id)));
  }) satisfies Handler,
  followUp: (async (req, res) => {
    const id = caseId(req.params.id);
    res.status(201).json(await adminAdoptionsService.followUp(currentAdmin(res), id, followUpSchema.parse(req.body)));
  }) satisfies Handler,
  escalate: (async (req, res) => {
    const id = caseId(req.params.id);
    res.json(await adminAdoptionsService.escalate(currentAdmin(res), id, escalateSchema.parse(req.body).note));
  }) satisfies Handler,
  reviewHandover: (async (req, res) => {
    const id = caseId(req.params.id);
    res.json(await adminAdoptionsService.reviewHandover(currentAdmin(res), id, reviewHandoverSchema.parse(req.body)));
  }) satisfies Handler,
  closeCase: (async (req, res) => {
    const id = caseId(req.params.id);
    res.json(await adminAdoptionsService.close(currentAdmin(res), id, closeSchema.parse(req.body).note));
  }) satisfies Handler,

  // ---- ผู้ใช้ ----
  listUsers: (async (req, res) => {
    res.json(await adminService.listUsers(userFiltersSchema.parse(req.query)));
  }) satisfies Handler,
  getUser: (async (req, res) => {
    res.json(await adminService.getUser(userId(req.params.id)));
  }) satisfies Handler,
  suspendUser: (async (req, res) => {
    const id = userId(req.params.id);
    res.json(await adminService.suspendUser(currentAdmin(res), id, suspendSchema.parse(req.body).reason));
  }) satisfies Handler,
  unsuspendUser: (async (req, res) => {
    res.json(await adminService.unsuspendUser(currentAdmin(res), userId(req.params.id)));
  }) satisfies Handler,

  // ---- สิทธิ์ผู้ดูแล ----
  listAdmins: (async (_req, res) => {
    res.json(await adminService.listAdmins());
  }) satisfies Handler,
  setAdminRole: (async (req, res) => {
    const id = userId(req.params.userId);
    res.json(await adminService.setAdminRole(currentAdmin(res), id, adminRoleSchema.parse(req.body).role));
  }) satisfies Handler,
  revokeAdmin: (async (req, res) => {
    await adminService.revokeAdmin(currentAdmin(res), userId(req.params.userId));
    res.status(204).end();
  }) satisfies Handler,

  // ---- ประกาศ ----
  listAnnouncements: (async (_req, res) => {
    res.json(await announcementsService.listAll());
  }) satisfies Handler,
  createAnnouncement: (async (req, res) => {
    res.status(201).json(await announcementsService.create(currentAdmin(res), announcementCreateSchema.parse(req.body)));
  }) satisfies Handler,
  updateAnnouncement: (async (req, res) => {
    const id = announcementId(req.params.id);
    res.json(await announcementsService.update(currentAdmin(res), id, announcementUpdateSchema.parse(req.body)));
  }) satisfies Handler,
  deleteAnnouncement: (async (req, res) => {
    await announcementsService.remove(currentAdmin(res), announcementId(req.params.id));
    res.status(204).end();
  }) satisfies Handler,

  // ---- รายงาน / audit ----
  reports: (async (req, res) => {
    res.json(await adminService.report(reportRangeSchema.parse(req.query)));
  }) satisfies Handler,
  auditLogs: (async (req, res) => {
    res.json(await adminService.auditLogs(auditFiltersSchema.parse(req.query)));
  }) satisfies Handler,
};
