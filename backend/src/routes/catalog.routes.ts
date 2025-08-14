import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import Style from '../models/style.model';
import Sku from '../models/sku.model';
import SizeVariant from '../models/sizeVariant.model';

const router = express.Router();

/* ---------- Style ---------- */
router.post('/styles', asyncHandler(async (req, res) => {
  const style = await Style.create(req.body);
  res.status(201).json({ style });
}));
router.get('/styles/:id', asyncHandler(async (req, res) => {
  const style = await Style.findById(req.params.id).populate('media').lean();
  if (!style) return res.status(404).json({ error: 'Style not found' });
  res.json({ style });
}));
router.patch('/styles/:id', asyncHandler(async (req, res) => {
  const style = await Style.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!style) return res.status(404).json({ error: 'Style not found' });
  res.json({ style });
}));

/* ---------- SKU (color-level) ---------- */
router.post('/styles/:styleId/skus', asyncHandler(async (req, res) => {
  const sku = await Sku.create({ ...req.body, styleId: req.params.styleId });
  res.status(201).json({ sku });
}));
router.get('/styles/:styleId/skus', asyncHandler(async (req, res) => {
  const skus = await Sku.find({ styleId: req.params.styleId }).populate('media').lean();
  res.json({ skus });
}));
router.patch('/skus/:id', asyncHandler(async (req, res) => {
  const sku = await Sku.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!sku) return res.status(404).json({ error: 'SKU not found' });
  res.json({ sku });
}));

/* ---------- SizeVariant (size-level) ---------- */
router.post('/skus/:skuId/sizes', asyncHandler(async (req, res) => {
  const size = await SizeVariant.create({ ...req.body, skuId: req.params.skuId });
  res.status(201).json({ size });
}));
router.get('/skus/:skuId/sizes', asyncHandler(async (req, res) => {
  const sizes = await SizeVariant.find({ skuId: req.params.skuId }).populate('media').lean();
  res.json({ sizes });
}));
router.patch('/sizes/:id', asyncHandler(async (req, res) => {
  const size = await SizeVariant.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!size) return res.status(404).json({ error: 'Size not found' });
  res.json({ size });
}));

export default router;
