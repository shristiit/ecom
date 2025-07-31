import mongoose, { Schema, model, Types } from 'mongoose';

export interface IProduct {
    _id: Types.ObjectId;

    sku: string;
    name: string;
    category?: string; //link to category tabel 
    supplier? : string; // later link to category table 
    season?: string;
    color?: string[];
    wholesalePrice?: number;
    rrp?: number;
    description: string;

}

const ProductSchema =new Schema<IProduct>(
    {
        sku: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
            minlength: 5,
            maxlength: 30,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        supplier: {
           type: String,
            required: true,
            trim: true, 
        },
        season: {
            type: String,
            required: true,
            trim: true, 
        },
        color: {
            type: [String],
            trim: true,
            default: [],
        },
        wholesalePrice: {
            type: Number,
            min: 0,
        },
        rrp: {
            type: Number,
            min: 0,  
        }
    },
    {
    timestamps: true,
    toJSON:   { getters: true,virtuals: true },
    toObject: { getters: true, virtuals: true },
    },
);
ProductSchema.index({ sku: 1 },{ unique: true });
ProductSchema.index({ name: 1});


export default model<IProduct>('Product', ProductSchema);
