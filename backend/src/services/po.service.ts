import PurchaseOrder from '../models/purchaseOrder.model';
import PurchaseOrderLine from '../models/purchaseOrderLine.model';
import StockItem from '../models/stockItem.model';
import mongoose, { Types } from 'mongoose';

export async function createPO(opts: { supplierId?: string; currency?: string }) {
  const po = await PurchaseOrder.create({ supplierId: opts.supplierId ? new Types.ObjectId(opts.supplierId) : undefined, currency: opts.currency || 'GBP' });
  return po.toObject();
}

export async function addPOLine(opts: { poId: string; sizeId: string; qty: number; eta: string; locationId: string }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const line = await PurchaseOrderLine.create([{
        poId: new Types.ObjectId(opts.poId),
        sizeId: new Types.ObjectId(opts.sizeId),
        qty: opts.qty,
        eta: new Date(opts.eta),
      }], { session });

      // bump incoming at intended location
      await StockItem.updateOne(
        { sizeId: new Types.ObjectId(opts.sizeId), locationId: new Types.ObjectId(opts.locationId) },
        { $inc: { incoming: opts.qty } },
        { upsert: true, session }
      );

      return line[0].toObject();
    });
  } finally {
    session.endSession();
  }
}

export async function getPO(poId: string) {
  const po = await PurchaseOrder.findById(poId).lean();
  if (!po) return null;
  const lines = await PurchaseOrderLine.find({ poId }).lean();
  return { ...po, lines };
}
