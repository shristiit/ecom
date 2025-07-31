import { Request,Response } from "express";
import Product from '../models/product.model';
import { validationResult
 } from "express-validator";
 import { Types
  } from "mongoose";


  export const createProduct =async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()){
        return res.status(400).json({errors: errors.array()});
    }
    try {
        const product = await Product.create(req.body);
        return res.status(201).json({message: 'Product added successfully'})
    } catch (err:any) {
        if (err.code ===11000){ 
            return res.status(409).json({ message: 'SKU must be unique' });
        }
        res.status(500).json({ message: 'Failed to create product', error: err.message});
    }
  };

  export const listProducts = =async (req: Request, res: Response) => {
    try {
        const products = await Product.find().sort({createdAt: -1});
        res.json(products);
    } catch (err:any) { 
        res.status(500).json({message:'Failed to list the products', error:err.message});
    
    }
  };

