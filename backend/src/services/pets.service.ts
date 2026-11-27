import { ApiError } from "../middleware/error.js";
import { petsRepository, toPet, type PetRow } from "../repositories/pets.repository.js";
import type { Pet } from "../types/dto.js";
import type { PetFilters, PetInput } from "../validators/pets.validator.js";
import { removeOwnUpload } from "./uploads.service.js";

export async function findPetOr404(id: number): Promise<PetRow> {
  const pet = await petsRepository.findById(id);
  if (!pet) throw new ApiError(404, "ไม่พบน้องที่ต้องการ");
  return pet;
}

export const petsService = {
  list: (filters: PetFilters) => petsRepository.list(filters),

  listMine: (userId: string) => petsRepository.listByOwner(userId),

  // โพสต์ที่ไม่ได้แสดงสาธารณะ: เห็นเฉพาะเจ้าของ (คนอื่นได้ 404 เหมือนไม่มีโพสต์นี้)
  async get(id: number, viewerId?: string): Promise<Pet> {
    const pet = await findPetOr404(id);
    if (pet.visibility !== "VISIBLE" && pet.ownerId !== viewerId) throw new ApiError(404, "ไม่พบน้องที่ต้องการ");
    return toPet(pet);
  },

  // เจ้าของมาจาก token เสมอ ไม่รับจาก body
  create: (userId: string, input: PetInput) => petsRepository.create(userId, input),

  async update(userId: string, id: number, input: PetInput): Promise<Pet> {
    const pet = await findPetOr404(id);
    if (pet.ownerId !== userId) throw new ApiError(403, "แก้ไขได้เฉพาะโพสต์ของตัวเอง");
    const updated = await petsRepository.update(id, input, pet.visibility === "CHANGES_REQUESTED");
    if (pet.imageUrl !== updated.imageUrl) await removeOwnUpload(pet.imageUrl, userId);
    return updated;
  },

  async remove(userId: string, id: number): Promise<void> {
    const pet = await findPetOr404(id);
    if (pet.ownerId !== userId) throw new ApiError(403, "ลบได้เฉพาะโพสต์ของตัวเอง");
    await petsRepository.delete(id);
    await removeOwnUpload(pet.imageUrl, userId);
  },
};
