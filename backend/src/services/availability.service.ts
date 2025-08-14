import StockItem from '../models/stockItem.model';
import PurchaseOrderLine from '../models/purchaseOrderLine.model';
import { Types } from 'mongoose';

export function computeATS(stock: { onHand: number; reservedOnHand: number; safetyStock: number; }) {
  return Math.max(0, (stock.onHand || 0) - (stock.reservedOnHand || 0) - (stock.safetyStock || 0));
}

export async function getATS(sizeId: string, locationId: string) {
  const doc = await StockItem.findOne({ sizeId, locationId }).lean();
  if (!doc) return 0;
  return computeATS(doc);
}

export async function getATSAllLocations(sizeId: string) {
  const rows = await StockItem.find({ sizeId }).lean();
  return rows.map(r => ({ locationId: r.locationId.toString(), ats: computeATS(r) }));
}

// Simple ATP by date: sum incoming<=D minus reservedIncoming<=D + ATS now
export async function getATPByDate(sizeId: string, dateISO: string) {
  const date = new Date(dateISO);
  const [stocks, reservedAgg, posAgg] = await Promise.all([
    StockItem.find({ sizeId }).lean(),
    StockItem.aggregate([
      { $match: { sizeId: new Types.ObjectId(sizeId) } },
      { $group: { _id: null, reservedIncoming: { $sum: '$reservedIncoming' } } }
    ]),
    PurchaseOrderLine.aggregate([
      { $match: { sizeId: new Types.ObjectId(sizeId), eta: { $lte: date } } },
      { $group: { _id: null, incoming: { $sum: { $subtract: ['$qty', '$receivedQty'] } } } }
    ])
  ]);
  const atsNow = stocks.reduce((acc, r) => acc + computeATS(r), 0);
  const reservedIncoming = reservedAgg[0]?.reservedIncoming || 0;
  const incomingByDate = posAgg[0]?.incoming || 0;
  return atsNow + (incomingByDate - reservedIncoming);
}
