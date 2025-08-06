import { Router } from "express";
import { body, param } from "express-validator";
import {
  createProduct,
  listProducts,
  getProductById,
  patchProductById,
  deleteProductById,
  uploadMediaFilesById,
  deleteMediaById,
} from "../controllers/product.controller";
import { authGuard } from "../middlewares/authGaurd";
import { roleGuard } from "../middlewares/roleGaurd";
import { upload } from "../config/storage"; // multer instance with limits

const router = Router();
const admin = [authGuard, roleGuard("admin")];

// Create
router.post(
  "/create",
  admin,
  [
    body("sku").isString().trim().isLength({ min: 5, max: 30 }),
    body("name").isString().trim().notEmpty(),
    body("description").isString().trim().notEmpty(),
    body("wholesalePrice").optional().isFloat({ min: 0 }),
    body("rrp").optional().isFloat({ min: 0 }),
    body("color").optional().customSanitizer((v) => v).custom((v) => Array.isArray(v) || typeof v === "string"),
    body("media").optional().isArray(),
    body("media.*.url").optional().isString(),
    body("media.*.type").optional().isIn(["image", "video"]),
  ],
  createProduct
);

// List (public or add authGuard if you prefer)
router.get("/list", listProducts);

// Read by id
router.get("/:id", authGuard, [param("id").isString().notEmpty()], getProductById);

// Patch by id
router.patch(
  "/:id",
  admin,
  [
    param("id").isString().notEmpty(),
    body("sku").optional().isString().trim().isLength({ min: 5, max: 30 }),
    body("name").optional().isString().trim(),
    body("description").optional().isString().trim(),
    body("wholesalePrice").optional().isFloat({ min: 0 }),
    body("rrp").optional().isFloat({ min: 0 }),
    body("color").optional().customSanitizer((v) => v).custom((v) => Array.isArray(v) || typeof v === "string"),
    body("media").optional().isArray(),
    body("media.*.url").optional().isString(),
    body("media.*.type").optional().isIn(["image", "video"]),
  ],
  patchProductById
);

// Delete by id
router.delete("/:id", admin, [param("id").isString().notEmpty()], deleteProductById);

// Upload media (by id)
router.post(
  "/:id/media/upload",
  admin,
  [param("id").isString().notEmpty()],
  // set file limits in storage (5 files, 5MB each); this is enforced by multer config
  upload.array("file", 5),
  uploadMediaFilesById
);

// Delete a media item
router.delete(
  "/:id/media/:mediaId",
  admin,
  [param("id").isString().notEmpty(), param("mediaId").isString().notEmpty()],
  deleteMediaById
);

export default router;
