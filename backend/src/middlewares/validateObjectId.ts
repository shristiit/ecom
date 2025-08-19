// src/middlewares/validateObjectId.ts
import { Types } from "mongoose";
import { Request, Response, NextFunction } from "express";

export function validateBodyObjectIds(keys: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bad: string[] = [];
    const check = (val: any, path: string) => {
      if (!Types.ObjectId.isValid(String(val))) bad.push(path);
    };
    // top-level keys
    keys.forEach(k => {
      const v = (req.body as any)?.[k];
      if (v !== undefined) check(v, k);
    });
    // items[].productId/variantId/sizeId
    if (Array.isArray((req.body as any)?.items)) {
      (req.body as any).items.forEach((it: any, idx: number) => {
        if (it.productId !== undefined) check(it.productId, `items[${idx}].productId`);
        if (it.variantId !== undefined) check(it.variantId, `items[${idx}].variantId`);
        if (it.sizeId !== undefined)    check(it.sizeId,    `items[${idx}].sizeId`);
      });
    }
    if (bad.length) {
      return res.status(400).json({ message: "Invalid ObjectId", fields: bad });
    }
    next();
  };
}
