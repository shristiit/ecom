import React from "react";

interface ProductDetailProps {
  params: {
    id: string;
  };
}

const ProductDetailPage = async ({ params }: ProductDetailProps) => {
  const { id } = params;

  const res = await fetch(`http://localhost:4000/api/products/bysku?sku=${id}`);
  const product = await res.json();

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
      <p><strong>SKU:</strong> {product.sku}</p>
      <p><strong>Description:</strong> {product.description}</p>
      <p><strong>Color:</strong> {product.color?.join(", ")}</p>
      <p><strong>Wholesale Price:</strong> {product.wholesalePrice}</p>
      <p><strong>RRP:</strong> {product.rrp}</p>
      <p><strong>Supplier:</strong> {product.supplier}</p>
      <p><strong>Category:</strong> {product.category}</p>
    </div>
  );
};

export default ProductDetailPage;
