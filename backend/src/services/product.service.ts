import Product, { IProduct } from '../models/product.model';
import Media, { IMedia } from '../models/media.model';

export const createProduct = (payload: Partial<IProduct>) =>
  Product.build(payload as any);

export const findBySku = (sku: string) =>
  Product.findOne({ sku: sku.toUpperCase() });

export const findByName = (name: string) =>
  Product.find({ name: new RegExp(name, 'i') }).limit(50);

export const findById = (id: string) =>
  Product.findById(id);

export const updateBySku = (sku: string, updates: Partial<IProduct>) =>
  Product.findOneAndUpdate(
    { sku: sku.toUpperCase() },
    updates,
    { new: true, runValidators: true }
  );

export const deleteBySku = (sku: string) =>
  Product.findOneAndDelete({ sku: sku.toUpperCase() });

export const addMedia = async (
  sku: string,
  mediaPayload: Omit<IMedia, '_id' | 'productId' | 'createdAt'>
) => {
  const product = await findBySku(sku);
  if (!product) throw new Error('Product not found');

  const media = await Media.create({
    ...mediaPayload,
    productId: product._id,
  });
  product.media.push(media._id);
  await product.save();
  return media;
};
