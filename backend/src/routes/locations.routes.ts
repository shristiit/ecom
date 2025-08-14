import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import Location from '../models/location.model';

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const loc = await Location.create(req.body);
  res.status(201).json({ location: loc });
}));

router.get('/', asyncHandler(async (_req, res) => {
  const locations = await Location.find().lean();
  res.json({ locations });
}));

export default router;
