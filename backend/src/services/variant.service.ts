import mongoose from 'mongoose';
import Variant from '../models/variant.model';
import Size from '../models/size.model';
import Archive from '../models/archive.model';

export async function add(productId: string, dto: any, adminId: any) {
  return Variant.create({
    productId,
    sku: dto.sku,
    color: dto.color,
    media: dto.media ?? [],
    createdBy: adminId
  });
}

export async function update(variantId: string, patch: any, adminId: any) {
  return Variant.findByIdAndUpdate(variantId, { $set: { ...patch, updatedBy: adminId } }, { new: true }).lean();
}

export async function removeCascadeArchive(variantId: string, adminId: any) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const variant = await Variant.findById(variantId).session(session);
    if (!variant) throw new Error('Variant not found');

    const sizes = await Size.find({ variantId: variant._id }).session(session);

    await Archive.insertMany([
      { kind:'variant', originalId: variant._id, snapshot: variant.toObject(), deletedBy: adminId },
      ...sizes.map(s => ({ kind:'size', originalId: s._id, snapshot: s.toObject(), deletedBy: adminId }))
    ], { session });

    await Size.updateMany({ variantId: variant._id }, { $set: { isDeleted: true } }, { session });
    await Variant.updateOne({ _id: variant._id }, { $set: { isDeleted: true } }, { session });

    await session.commitTransaction();
    session.endSession();
  } catch (e) {
    await session.abortTransaction();
    session.endSession();
    throw e;
  }
}
