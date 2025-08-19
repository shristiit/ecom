import { Types } from "mongoose";
import Size from "../models/size.model";

export async function ensureLocationRow(
  sizeId: string | Types.ObjectId,
  location: string,
  opts: { session?: any } = {}
) {
  await Size.updateOne(
    { _id: sizeId, "inventory.location": { $ne: location } },
    { $push: { inventory: { location, onHand: 0, onOrder: 0, reserved: 0 } } },
    opts
  );
}

// Reserve (place order): reserved += qty if (onHand - reserved) >= qty
export async function reserveStock(
  sizeId: string | Types.ObjectId,
  location: string,
  qty: number,
  opts: { session?: any } = {}
) {
  await ensureLocationRow(sizeId, location, opts);
  const res = await Size.updateOne(
    { _id: sizeId },
    { $inc: { "inventory.$[loc].reserved": qty } },
    {
      arrayFilters: [
        {
          "loc.location": location,
          $expr: { $gte: [{ $subtract: ["$$loc.onHand", "$$loc.reserved"] }, qty] },
        },
      ],
      ...opts,
    }
  );
  return res.modifiedCount > 0;
}

// Cancel: reserved -= qty (do not touch onHand)
export async function releaseReservation(
  sizeId: string | Types.ObjectId,
  location: string,
  qty: number,
  opts: { session?: any } = {}
) {
  const res = await Size.updateOne(
    { _id: sizeId },
    { $inc: { "inventory.$[loc].reserved": -qty } },
    {
      arrayFilters: [{ "loc.location": location, "loc.reserved": { $gte: qty } }],
      ...opts,
    }
  );
  return res.modifiedCount > 0;
}

// Deliver/ship: onHand -= qty; reserved -= qty
export async function commitShipment(
  sizeId: string | Types.ObjectId,
  location: string,
  qty: number,
  opts: { session?: any } = {}
) {
  const res = await Size.updateOne(
    { _id: sizeId },
    {
      $inc: {
        "inventory.$[loc].onHand": -qty,
        "inventory.$[loc].reserved": -qty,
      },
    },
    {
      arrayFilters: [
        { "loc.location": location, "loc.onHand": { $gte: qty }, "loc.reserved": { $gte: qty } },
      ],
      ...opts,
    }
  );
  return res.modifiedCount > 0;
}
