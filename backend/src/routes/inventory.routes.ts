import express from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { getATS, getATSAllLocations, getATPByDate } from '../services/availability.service';
import { adjustOnHand, transfer, reserveOnHand, reserveIncoming, releaseReservation, pick, receivePO } from '../services/inventory.service';

const router = express.Router();

/* Availability */
router.get('/ats', asyncHandler(async (req, res) => {
  const { sizeId, locationId } = req.query as any;
  if (!sizeId || !locationId) return res.status(400).json({ error: 'sizeId and locationId required' });
  const ats = await getATS(sizeId, locationId);
  res.json({ sizeId, locationId, ats });
}));

router.get('/ats/all', asyncHandler(async (req, res) => {
  const { sizeId } = req.query as any;
  if (!sizeId) return res.status(400).json({ error: 'sizeId required' });
  const rows = await getATSAllLocations(sizeId);
  res.json({ sizeId, rows });
}));

router.get('/atp', asyncHandler(async (req, res) => {
  const { sizeId, date } = req.query as any;
  if (!sizeId || !date) return res.status(400).json({ error: 'sizeId and date required' });
  const atp = await getATPByDate(sizeId, date);
  res.json({ sizeId, date, atp });
}));

/* Adjust & transfer */
router.post('/adjust', asyncHandler(async (req, res) => {
  const { sizeId, locationId, delta, note, userId } = req.body;
  await adjustOnHand({ sizeId, locationId, delta, note, userId });
  res.json({ ok: true });
}));

router.post('/transfer', asyncHandler(async (req, res) => {
  const { sizeId, fromLocationId, toLocationId, qty, note, userId } = req.body;
  await transfer({ sizeId, fromLocationId, toLocationId, qty, note, userId });
  res.json({ ok: true });
}));

/* Reservations & picking */
router.post('/orders/:orderId/lines/:lineId/reserve-onhand', asyncHandler(async (req, res) => {
  const { orderId, lineId } = req.params;
  const { sizeId, locationId, qty, expiresAt, note, userId } = req.body;
  await reserveOnHand({ orderId, orderLineId: lineId, sizeId, locationId, qty, expiresAt, note, userId });
  res.json({ ok: true });
}));

router.post('/orders/:orderId/lines/:lineId/reserve-incoming', asyncHandler(async (req, res) => {
  const { orderId, lineId } = req.params;
  const { sizeId, locationId, qty, note, userId } = req.body;
  await reserveIncoming({ orderId, orderLineId: lineId, sizeId, locationId, qty, note, userId });
  res.json({ ok: true });
}));

router.post('/reservations/:reservationId/release', asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const { reason, userId } = req.body;
  await releaseReservation({ reservationId, reason, userId });
  res.json({ ok: true });
}));

router.post('/orders/:orderId/lines/:lineId/pick', asyncHandler(async (req, res) => {
  const { orderId, lineId } = req.params;
  const { note, userId } = req.body;
  await pick({ orderId, orderLineId: lineId, locationId: req.body.locationId, note, userId });
  res.json({ ok: true });
}));

/* PO receiving */
router.post('/pos/receive', asyncHandler(async (req, res) => {
  // body: { receipts: [{ lineId, locationId, qtyReceived }], note?, userId? }
  await receivePO(req.body);
  res.json({ ok: true });
}));

export default router;
