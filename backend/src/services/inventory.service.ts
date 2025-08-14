import mongoose, { Types } from 'mongoose';
import StockItem from '../models/stockItem.model';
import StockLedger from '../models/stockLedger.model';
import Reservation from '../models/reservation.model';
import PurchaseOrderLine from '../models/purchaseOrderLine.model';
import { InventoryError, ERR } from '../utils/errors';

async function getOrCreateStockItem(sizeId: Types.ObjectId, locationId: Types.ObjectId, session: mongoose.ClientSession) {
  const doc = await StockItem.findOneAndUpdate(
    { sizeId, locationId },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true, session }
  );
  return doc;
}

async function writeLedger({ sizeId, locationId, type, quantity, session, refType, refId, note, userId } : any) {
  await StockLedger.create([{
    sizeId, locationId, type, quantity, refType, refId, note, createdBy: userId
  }], { session });
}

// Adjust physical onHand (manual or stocktake)
export async function adjustOnHand(opts: { sizeId: string; locationId: string; delta: number; note?: string; userId?: string }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sizeId = new Types.ObjectId(opts.sizeId);
      const locationId = new Types.ObjectId(opts.locationId);
      const stock = await getOrCreateStockItem(sizeId, locationId, session);
      const newOnHand = stock.onHand + opts.delta;
      if (newOnHand < 0) throw new InventoryError(ERR.INVALID_STATE, 'onHand cannot be negative');
      stock.onHand = newOnHand;
      await stock.save({ session });
      await writeLedger({ sizeId, locationId, type: 'ADJUSTMENT', quantity: opts.delta, session, note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
    });
  } finally {
    session.endSession();
  }
}

// Transfer between locations
export async function transfer(opts: { sizeId: string; fromLocationId: string; toLocationId: string; qty: number; note?: string; userId?: string }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sizeId = new Types.ObjectId(opts.sizeId);
      const from = new Types.ObjectId(opts.fromLocationId);
      const to   = new Types.ObjectId(opts.toLocationId);
      if (from.equals(to)) throw new InventoryError(ERR.BAD_INPUT, 'from/to location must differ', 400);

      const sFrom = await getOrCreateStockItem(sizeId, from, session);
      if (sFrom.onHand < opts.qty) throw new InventoryError(ERR.INSUFFICIENT_STOCK, 'Insufficient onHand at source');
      sFrom.onHand -= opts.qty;
      await sFrom.save({ session });
      await writeLedger({ sizeId, locationId: from, type: 'TRANSFER_OUT', quantity: -opts.qty, session, note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });

      const sTo = await getOrCreateStockItem(sizeId, to, session);
      sTo.onHand += opts.qty;
      await sTo.save({ session });
      await writeLedger({ sizeId, locationId: to, type: 'TRANSFER_IN', quantity: opts.qty, session, note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
    });
  } finally {
    session.endSession();
  }
}

// Reserve from on-hand
export async function reserveOnHand(opts: { orderId: string; orderLineId: string; sizeId: string; locationId: string; qty: number; expiresAt?: Date | null; note?: string; userId?: string; }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sizeId = new Types.ObjectId(opts.sizeId);
      const locationId = new Types.ObjectId(opts.locationId);
      const stock = await getOrCreateStockItem(sizeId, locationId, session);
      const ats = stock.onHand - stock.reservedOnHand - stock.safetyStock;
      if (opts.qty > ats) throw new InventoryError(ERR.INSUFFICIENT_STOCK, 'Not enough ATS to reserve');
      stock.reservedOnHand += opts.qty;
      await stock.save({ session });

      await Reservation.create([{
        orderId: new Types.ObjectId(opts.orderId),
        orderLineId: new Types.ObjectId(opts.orderLineId),
        sizeId, locationId, qty: opts.qty, kind: 'ON_HAND', status: 'ACTIVE', expiresAt: opts.expiresAt ?? null
      }], { session });

      await writeLedger({ sizeId, locationId, type: 'SALE_ALLOCATE', quantity: opts.qty, session, refType: 'Order', refId: new Types.ObjectId(opts.orderId), note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
    });
  } finally {
    session.endSession();
  }
}

// Reserve against incoming (prelaunch/forward order)
export async function reserveIncoming(opts: { orderId: string; orderLineId: string; sizeId: string; locationId: string; qty: number; note?: string; userId?: string; }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sizeId = new Types.ObjectId(opts.sizeId);
      const locationId = new Types.ObjectId(opts.locationId);

      // earliest PO line with availability
      const poLine = await PurchaseOrderLine
        .findOne({ sizeId, eta: { $gte: new Date() } })
        .sort({ eta: 1 })
        .session(session);

      if (!poLine) throw new InventoryError(ERR.NO_INCOMING_SOURCE, 'No incoming PO line found');

      // current reserved against this line
      const [{ qty: already = 0 } = {} as any] = await Reservation.aggregate([
        { $match: { kind: 'INCOMING', sourceId: poLine._id, status: 'ACTIVE' } },
        { $group: { _id: null, qty: { $sum: '$qty' } } }
      ]).session(session);

      const availableIncoming = poLine.qty - poLine.receivedQty - (already || 0);
      if (opts.qty > availableIncoming) throw new InventoryError(ERR.INSUFFICIENT_INCOMING, 'Not enough incoming to reserve');

      const stock = await getOrCreateStockItem(sizeId, locationId, session);
      stock.reservedIncoming += opts.qty;            // NOTE: maintain stock.incoming via PO creation/upd
      await stock.save({ session });

      await Reservation.create([{
        orderId: new Types.ObjectId(opts.orderId),
        orderLineId: new Types.ObjectId(opts.orderLineId),
        sizeId, locationId, qty: opts.qty,
        kind: 'INCOMING', sourceId: poLine._id, eta: poLine.eta, status: 'ACTIVE'
      }], { session });

      await writeLedger({ sizeId, locationId, type: 'SALE_ALLOCATE', quantity: opts.qty, session, refType: 'Order', refId: new Types.ObjectId(opts.orderId), note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
    });
  } finally {
    session.endSession();
  }
}

// Release a reservation
export async function releaseReservation(opts: { reservationId: string; reason?: string; userId?: string; }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const rsv = await Reservation.findById(opts.reservationId).session(session);
      if (!rsv) throw new InventoryError(ERR.NOT_FOUND, 'Reservation not found', 404);
      if (rsv.status !== 'ACTIVE') throw new InventoryError(ERR.INVALID_STATE, 'Reservation not ACTIVE');

      const stock = await getOrCreateStockItem(rsv.sizeId as Types.ObjectId, rsv.locationId as Types.ObjectId, session);
      if (rsv.kind === 'ON_HAND') {
        if (stock.reservedOnHand < rsv.qty) throw new InventoryError(ERR.INVALID_STATE, 'ReservedOnHand underflow');
        stock.reservedOnHand -= rsv.qty;
      } else {
        if (stock.reservedIncoming < rsv.qty) throw new InventoryError(ERR.INVALID_STATE, 'ReservedIncoming underflow');
        stock.reservedIncoming -= rsv.qty;
      }
      await stock.save({ session });

      rsv.status = 'RELEASED';
      await rsv.save({ session });

      await writeLedger({ sizeId: rsv.sizeId, locationId: rsv.locationId, type: 'SALE_DEALLOCATE', quantity: rsv.qty, session, refType: 'Order', refId: rsv.orderId, note: opts.reason, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
    });
  } finally {
    session.endSession();
  }
}

// Pick (consume ON_HAND reservations -> decrement onHand/reservedOnHand)
export async function pick(opts: { orderId: string; orderLineId: string; locationId: string; note?: string; userId?: string; }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const lineMatch = { orderId: new Types.ObjectId(opts.orderId), orderLineId: new Types.ObjectId(opts.orderLineId), kind: 'ON_HAND', status: 'ACTIVE' as const };
      const reservations = await Reservation.find(lineMatch).sort({ createdAt: 1 }).session(session);
      if (reservations.length === 0) throw new InventoryError(ERR.NOT_FOUND, 'No ACTIVE ON_HAND reservations', 404);

      // group by sizeId/locationId
      const buckets = new Map<string, { sizeId: Types.ObjectId; locationId: Types.ObjectId; qty: number; items: typeof reservations }>();
      for (const r of reservations) {
        const key = `${r.sizeId.toString()}::${r.locationId.toString()}`;
        if (!buckets.has(key)) buckets.set(key, { sizeId: r.sizeId as Types.ObjectId, locationId: r.locationId as Types.ObjectId, qty: 0, items: [] as any });
        const b = buckets.get(key)!;
        b.qty += r.qty; b.items.push(r);
      }

      for (const { sizeId, locationId, qty, items } of buckets.values()) {
        const stock = await getOrCreateStockItem(sizeId, locationId, session);
        if (stock.reservedOnHand < qty || stock.onHand < qty) throw new InventoryError(ERR.INVALID_STATE, 'Insufficient reserved/onHand to pick');
        stock.reservedOnHand -= qty;
        stock.onHand -= qty;
        await stock.save({ session });

        for (const r of items) { r.status = 'CONSUMED'; await r.save({ session }); }

        await writeLedger({ sizeId, locationId, type: 'PICK', quantity: qty, session, refType: 'Order', refId: new Types.ObjectId(opts.orderId), note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });
      }
    });
  } finally {
    session.endSession();
  }
}

// Receive PO lines
export async function receivePO(opts: { receipts: Array<{ lineId: string; locationId: string; qtyReceived: number }>; note?: string; userId?: string; }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const rcpt of opts.receipts) {
        const line = await PurchaseOrderLine.findById(rcpt.lineId).session(session);
        if (!line) throw new InventoryError(ERR.NOT_FOUND, `PO line not found: ${rcpt.lineId}`, 404);
        line.receivedQty += rcpt.qtyReceived;
        await line.save({ session });

        const sizeId = line.sizeId as Types.ObjectId;
        const locationId = new Types.ObjectId(rcpt.locationId);
        const stock = await getOrCreateStockItem(sizeId, locationId, session);

        const decIncoming = Math.min(stock.incoming, rcpt.qtyReceived);
        stock.incoming -= decIncoming;
        stock.onHand += rcpt.qtyReceived;
        await stock.save({ session });

        await writeLedger({ sizeId, locationId, type: 'PURCHASE_RECEIPT', quantity: rcpt.qtyReceived, session, refType: 'PurchaseOrder', refId: line.poId, note: opts.note, userId: opts.userId ? new Types.ObjectId(opts.userId) : undefined });

        // Flip INCOMING reservations for this line to ON_HAND
        const incomingRsvs = await Reservation.find({ kind: 'INCOMING', sourceId: line._id, status: 'ACTIVE' }).sort({ createdAt: 1 }).session(session);
        for (const r of incomingRsvs) {
          const s = await getOrCreateStockItem(sizeId, locationId, session);
          if (s.reservedIncoming < r.qty) continue;
          s.reservedIncoming -= r.qty;
          s.reservedOnHand  += r.qty;
          await s.save({ session });
          r.kind = 'ON_HAND';
          await r.save({ session });
        }
      }
    });
  } finally {
    session.endSession();
  }
}
