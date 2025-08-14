import { Types } from 'mongoose';
import Media from '../models/media.model';
import Style from '../models/style.model';
import Sku from '../models/sku.model';
import SizeVariant from '../models/sizeVariant.model';
import { AppError, ERR } from '../utils/errors';

export async function attachMediaToStyle(styleId: string, mediaIds: string[], mode: 'append' | 'set' = 'append') {
  const style = await Style.findById(styleId);
  if (!style) throw new AppError(404, 'Style not found', ERR.NOT_FOUND);
  const set = new Set((style.media as any[]).map((id) => id.toString()));
  for (const id of mediaIds) set.add(id);
  style.media = (mode === 'set' ? mediaIds : Array.from(set)).map((id) => new Types.ObjectId(id)) as any;
  await style.save();
  return style.toObject();
}

export async function attachMediaToSku(skuId: string, mediaIds: string[], mode: 'append' | 'set' = 'append') {
  const sku = await Sku.findById(skuId);
  if (!sku) throw new AppError(404, 'SKU not found', ERR.NOT_FOUND);
  const set = new Set((sku.media as any[]).map((id) => id.toString()));
  for (const id of mediaIds) set.add(id);
  sku.media = (mode === 'set' ? mediaIds : Array.from(set)).map((id) => new Types.ObjectId(id)) as any;
  await sku.save();
  return sku.toObject();
}

export async function attachMediaToSize(sizeId: string, mediaIds: string[], mode: 'append' | 'set' = 'append') {
  const size = await SizeVariant.findById(sizeId);
  if (!size) throw new AppError(404, 'SizeVariant not found', ERR.NOT_FOUND);
  const set = new Set((size.media as any[]).map((id) => id.toString()));
  for (const id of mediaIds) set.add(id);
  size.media = (mode === 'set' ? mediaIds : Array.from(set)).map((id) => new Types.ObjectId(id)) as any;
  await size.save();
  return size.toObject();
}

export async function detachMediaFromModel(model: 'style'|'sku'|'size', modelId: string, mediaId: string) {
  const M = model === 'style' ? Style : model === 'sku' ? Sku : SizeVariant;
  const doc = await M.findById(modelId);
  if (!doc) throw new AppError(404, `${model} not found`, ERR.NOT_FOUND);
  (doc as any).media = ((doc as any).media as any[]).filter((id) => id.toString() !== mediaId);
  await doc.save();
  return doc.toObject();
}
