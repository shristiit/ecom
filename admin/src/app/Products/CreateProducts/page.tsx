"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ProductCategory, SeasonOptions, BrandOptions } from "../../Assets/ProductData";
import axios from "axios";

interface Media {
  url: string;
  type: "image" | "video";
}

interface ProductFormData {
  sku: string;
  name: string;
  description: string;
  wholesalePrice: string;
  rrp: string;
  color: string[];
  media: Media[];
  category: string;
  supplier: string;
  season: string;
  brand: string;
}

const CreateProduct = () => {
  const [formData, setFormData] = useState<ProductFormData>({
    sku: "",
    name: "",
    description: "",
    wholesalePrice: "",
    rrp: "",
    color: [],
    media: [],
    category: "",
    supplier: "",
    season: "",
    brand: "",
  });

  const changeHandle = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "color") {
      setFormData((prev) => ({
        ...prev,
        color: [value],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const submitHandle = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await axios.post(
        "http://localhost:4000/api/products/create",
        formData
      );
      alert("Product Created Successfully!");
      console.log(res.data);
    } catch (err: any) {
      console.error("Error creating product", err);
      alert("Error creating product");
    }
  };

  return (
    <Card className="p-6 max-w-xl mx-auto mt-10 space-y-6 shadow-md rounded-lg">
      <h1 className="text-2xl font-bold text-center">Create Product</h1>
      <form onSubmit={submitHandle} className="space-y-4">
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            value={formData.sku}
            onChange={changeHandle}
            required
          />
        </div>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={changeHandle}
            required
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            value={formData.description}
            onChange={changeHandle}
            required
          />
        </div>
        <div>
          <Label htmlFor="wholesalePrice">Wholesale Price</Label>
          <Input
            id="wholesalePrice"
            type="number"
            name="wholesalePrice"
            value={formData.wholesalePrice}
            onChange={changeHandle}
          />
        </div>
        <div>
          <Label htmlFor="rrp">RRP</Label>
          <Input
            id="rrp"
            type="number"
            name="rrp"
            value={formData.rrp}
            onChange={changeHandle}
          />
        </div>
        <div>
          <Label htmlFor="color">Color</Label>
          <select
            id="color"
            name="color"
            onChange={changeHandle}
            value={formData.color[0] || ""}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Color</option>
            {SeasonOptions.map((colorOption, index) => (
              <option key={index} value={colorOption}>
                {colorOption}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            onChange={changeHandle}
            value={formData.category}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Category</option>
            {ProductCategory.map((cat, index) => (
              <option key={index} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="brand">Brand</Label>
          <select
            id="brand"
            name="brand"
            onChange={changeHandle}
            value={formData.brand}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Brand</option>
            {BrandOptions.map((brand, index) => (
              <option key={index} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="supplier">Supplier</Label>
          <Input
            id="supplier"
            type="text"
            name="supplier"
            value={formData.supplier}
            onChange={changeHandle}
          />
        </div>
        <div>
          <Label htmlFor="season">Season</Label>
          <select
            id="season"
            name="season"
            onChange={changeHandle}
            value={formData.season}
            className="w-full border rounded-md p-2"
          >
            <option value="">Select Season</option>
            {SeasonOptions.map((seasonOpt, index) => (
              <option key={index} value={seasonOpt}>
                {seasonOpt}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="w-full mt-4">
          Submit Product
        </Button>
      </form>
    </Card>
  );
};

export default CreateProduct;
