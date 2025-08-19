import { Request, Response } from 'express';
import * as productSvc from '../services/product.service';
import * as variantSvc from '../services/variant.service';
import * as sizeSvc from '../services/size.service';
import asyncHandler from '../utils/asyncHandler';

export const createProductDeep = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user?._id ?? null; // safe
  const created = await productSvc.createDeep(req.body, adminId);
  res.status(201).json(created);
});

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', q, status } = req.query as any;
  const result = await productSvc.list({
    page: parseInt(String(page), 10),
    limit: parseInt(String(limit), 10),
    q: q || '',
    status,
  });
  res.json(result);
});

export const getProductDeep = asyncHandler(async (req: Request, res: Response) => {
  const product = await productSvc.getDeep(req.params.id);
  if (!product) return res.status(404).json({ message: 'Not found' });
  res.json(product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  const updated = await productSvc.updatePartial(req.params.id, req.body, actorId);
  res.json(updated);
});

export const setProductStatus = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  const { status } = req.body; // 'active' | 'inactive'
  const updated = await productSvc.setStatus(req.params.id, status, actorId);
  res.json(updated);
});

// Variants
export const addVariant = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  const variant = await variantSvc.add(req.params.id, req.body, actorId);
  res.status(201).json(variant);
});

export const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  res.json(await variantSvc.update(req.params.variantId, req.body, actorId));
});

export const deleteVariantCascadeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  await variantSvc.removeCascadeArchive(req.params.variantId, actorId);
  res.status(204).send();
});

// Sizes
export const addSize = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  res.status(201).json(await sizeSvc.add(req.params.variantId, req.body, actorId));
});

export const updateSize = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  res.json(await sizeSvc.update(req.params.sizeId, req.body, actorId));
});

export const deleteSizeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  await sizeSvc.removeArchive(req.params.sizeId, actorId);
  res.status(204).send();
});

// Product delete
export const deleteProductCascadeArchive = asyncHandler(async (req: Request, res: Response) => {
  const actorId = req.user?._id ?? null; // safe
  await productSvc.removeCascadeArchive(req.params.id, actorId);
  res.status(204).send();
});
