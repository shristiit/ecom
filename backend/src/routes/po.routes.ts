import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { createPO, addPOLine, getPO } from '../services/po.service';

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const po = await createPO({ supplierId: req.body.supplierId, currency: req.body.currency });
  res.status(201).json({ po });
}));

router.post('/:poId/lines', asyncHandler(async (req, res) => {
  const { poId } = req.params;
  const { sizeId, qty, eta, locationId } = req.body;
  const line = await addPOLine({ poId, sizeId, qty, eta, locationId });
  res.status(201).json({ line });
}));

router.get('/:poId', asyncHandler(async (req, res) => {
  const po = await getPO(req.params.poId);
  if (!po) return res.status(404).json({ error: 'PO not found' });
  res.json({ po });
}));

export default router;
