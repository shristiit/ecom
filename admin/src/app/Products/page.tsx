import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import React from 'react'
import {ProductCategory} from "../Assets/ProductData"
const Products = () => {
  return (
    <div className="p-4 m-2">
      <h1 className="text-xl font-semibold text-center border-b-4 m-2 pb-2">Product Information</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card className='border-2 border-gray-300 p-4 flex flex-col '> 
          <CardHeader>General Information</CardHeader>
          <label>Product Name</label>
          <input type='text' className='border m-1 h-10 p-2 w-full' />
          <label>Product Category</label>
          <select className='border p-2'>
           <option>select</option>
           {ProductCategory.map((brand,index) =>(
            <option key={index}>{brand}</option>
           ))}
          </select>
          <label>Description</label>
          <input type='text' className='border text-base leading-tight m-1 h-[10rem] p-2 w-full' />

        </Card>
        <Card>
          <CardHeader>Product Media</CardHeader>

        </Card>
        <Card></Card>
        <Card></Card>
      </div>
    </div>
  )
}

export default Products
