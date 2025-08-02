import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Product from '../models/product.model';
import Media, { IMedia } from '../models/media.model';
import { Types } from 'mongoose';


export const createProduct = async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const {
    sku,
    name,
    category,
    supplier,
    season,
    color,
    wholesalePrice,
    rrp,
    description,
    media: mediaItems = [],
  } = req.body;

  try {
    const product = await Product.create({
      sku: sku.toUpperCase(),
      name,
      category,
      supplier,
      season,
      color,
      wholesalePrice,
      rrp,
      description,
      media: [],
    });

    if (Array.isArray(mediaItems) && mediaItems.length > 0) {
      const mediaIds: Types.ObjectId[] = [];
      for (const m of mediaItems) {
        const newMedia = await Media.create({
          productId: product._id,
          url: m.url,
          type: m.type,
          altText: m.altText,
          order: m.order,
        } as Omit<IMedia, '_id'>);
        mediaIds.push(newMedia._id);
      }
      product.media = mediaIds;
      await product.save();
    }

    res.status(201).json(product);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to create product', error: err.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  const { sku } = req.params;
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const {
    name,
    category,
    supplier,
    season,
    color,
    wholesalePrice,
    rrp,
    description,
    media: mediaItems = [],
  } = req.body;

  try {
    const product = await Product.findOne({ sku: sku.toUpperCase() });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (name) product.name = name;
    if (category) product.category = category;
    if (supplier) product.supplier = supplier;
    if (season) product.season = season;
    if (Array.isArray(color)) product.color = color;
    if (wholesalePrice !== undefined) product.wholesalePrice = wholesalePrice;
    if (rrp !== undefined) product.rrp = rrp;
    if (description) product.description = description;

    if (Array.isArray(mediaItems) && mediaItems.length > 0) {
      for (const m of mediaItems) {
        const newMedia = await Media.create({
          productId: product._id,
          url: m.url,
          type: m.type,
          altText: m.altText,
          order: m.order,
        } as Omit<IMedia, '_id'>);
        product.media.push(newMedia._id);
      }
    }

    await product.save();
    res.json(product);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to update product', error: err.message });
  }
};


export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const sku = req.params.sku.toUpperCase();
    const product = await Product.findOneAndDelete({ sku });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await Media.deleteMany({ productId: product._id });
    res.status(204).send();
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to delete product', error: err.message });
  }
};


export const listProducts = async (_req: Request, res: Response) => {
  try {
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .populate('media');
    res.json(products);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to list products', error: err.message });
  }
};


export const getProductBySku = async (req: Request, res: Response) => {
  try {
    const product = await Product.findOne({
      sku: req.params.sku.toUpperCase(),
    }).populate('media');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to get product', error: err.message });
  }
};


export const getProductByName = async (req: Request, res: Response) => {
  try {
    const name = String(req.params.name);
    const products = await Product.find({
      name: new RegExp(name, 'i'),
    })
      .sort({ createdAt: -1 })
      .populate('media');
    res.json(products);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to search products', error: err.message });
  }
};


export const uploadMediaFiles = async (req: Request, res: Response) => {
  const { sku } = req.params;
  const product = await Product.findOne({ sku: sku.toUpperCase() });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0)
    return res.status(400).json({ message: 'No files uploaded' });

  try {
    const created: IMedia[] = [];
    for (const file of files) {
      const media = await Media.create({
        productId: product._id,
        url: `/static/uploads/${file.filename}`,
        type: 'image',
        altText: file.originalname,
        order: product.media.length + created.length,
      } as Omit<IMedia, '_id'>);
      product.media.push(media._id);
      created.push(media);
    }
    await product.save();
    res.status(201).json(created);
  } catch (err: any) {
    res
      .status(500)
      .json({ message: 'Failed to upload media files', error: err.message });
  }
};
