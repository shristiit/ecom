import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { isValidObjectId, Types } from "mongoose";
import Product from "../models/product.model";
import Media, { IMedia } from "../models/media.model";

// Utility: normalize color to array if provided as comma-separated string
const normalizeColor = (color: unknown): string[] | undefined => {
  if (Array.isArray(color)) return color.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof color === "string") {
    return color
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
};

/** POST /api/products/create */
export const createProduct = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const {
      sku,
      name,
      category,
      supplier,
      season,
      color,
      wholesalePrice,
      rrp,
      description,
      media: mediaItems = [],
    } = req.body;

    const product = await Product.create({
      sku: String(sku).toUpperCase(),
      name,
      category,
      supplier,
      season,
      color: normalizeColor(color) ?? [],
      wholesalePrice,
      rrp,
      description,
      media: [],
    });

    // Optional: attach media by URL from body
    if (Array.isArray(mediaItems) && mediaItems.length > 0) {
      const mediaIds: Types.ObjectId[] = [];
      for (const m of mediaItems) {
        const newMedia = await Media.create({
          productId: product._id,
          url: m.url,
          type: m.type,
          altText: m.altText,
          order: typeof m.order === "number" ? m.order : 0,
        } as Omit<IMedia, "_id">);
        mediaIds.push(newMedia._id);
      }
      product.media = mediaIds;
      await product.save();
    }

    const created = await Product.findById(product._id).populate("media");
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to create product", error: err.message });
  }
};

/** GET /api/products/list */
export const listProducts = async (_req: Request, res: Response) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).populate("media");
    res.json(products); // return array (frontend does client-side pagination)
  } catch (err: any) {
    res.status(500).json({ message: "Failed to list products", error: err.message });
  }
};

/** GET /api/products/:id */
export const getProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const product = await Product.findById(id).populate("media");
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to get product", error: err.message });
  }
};

/** PATCH /api/products/:id */
export const patchProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const {
      sku,
      name,
      category,
      supplier,
      season,
      color,
      wholesalePrice,
      rrp,
      description,
      media: mediaItems = [],
    } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (sku) product.sku = String(sku).toUpperCase();
    if (name) product.name = name;
    if (category) product.category = category;
    if (supplier) product.supplier = supplier;
    if (season) product.season = season;

    const normalizedColor = normalizeColor(color);
    if (normalizedColor) product.color = normalizedColor;

    if (wholesalePrice !== undefined) product.wholesalePrice = wholesalePrice;
    if (rrp !== undefined) product.rrp = rrp;
    if (description !== undefined) product.description = description;

    // Optionally append media from body (URL entries)
    if (Array.isArray(mediaItems) && mediaItems.length > 0) {
      for (const m of mediaItems) {
        const newMedia = await Media.create({
          productId: product._id,
          url: m.url,
          type: m.type,
          altText: m.altText,
          order: typeof m.order === "number" ? m.order : product.media.length,
        } as Omit<IMedia, "_id">);
        product.media.push(newMedia._id);
      }
    }

    await product.save();
    const updated = await Product.findById(id).populate("media");
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to update product", error: err.message });
  }
};

/** DELETE /api/products/:id */
export const deleteProductById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const product = await Product.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    await Media.deleteMany({ productId: product._id });
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to delete product", error: err.message });
  }
};

/** POST /api/products/:id/media/upload */
export const uploadMediaFilesById = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

  const product = await Product.findById(id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });

  try {
    const created: IMedia[] = [];
    for (const file of files) {
      // Safety check; multer should also enforce this
      if (file.size > 5 * 1024 * 1024) {
        return res.status(413).json({ message: `${file.originalname} exceeds 5MB limit` });
      }
      const media = await Media.create({
        productId: product._id,
        url: `/static/uploads/${file.filename}`,
        type: "image",
        altText: file.originalname,
        order: product.media.length + created.length,
      } as Omit<IMedia, "_id">);
      product.media.push(media._id);
      created.push(media);
    }
    await product.save();
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to upload media files", error: err.message });
  }
};

/** DELETE /api/products/:id/media/:mediaId */
export const deleteMediaById = async (req: Request, res: Response) => {
  const { id, mediaId } = req.params;
  if (!isValidObjectId(id) || !isValidObjectId(mediaId)) {
    return res.status(400).json({ message: "Invalid id(s)" });
  }

  try {
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const media = await Media.findOneAndDelete({ _id: mediaId, productId: id });
    if (!media) return res.status(404).json({ message: "Media not found" });

    product.media = product.media.filter((mId) => mId.toString() !== mediaId);
    await product.save();

    res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ message: "Failed to delete media", error: err.message });
  }
};
