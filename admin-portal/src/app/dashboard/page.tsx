'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface User {
  _id: string;
  username: string;
  email: string;
  role: string;
}

interface Media {
  _id: string;
  url: string;
  type: 'image' | 'video';
}

interface Product {
  _id: string;
  sku: string;
  name: string;
  description: string;
  rrp?: number;
  media: Media[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser]         = React.useState<User | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading]   = React.useState(true);

  React.useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }

    // 1) Fetch user
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unauthorized');
        const data: User = await res.json();
        setUser(data);
        return data;
      })
      
      .then(() =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/products/list`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load products');
        const list: Product[] = await res.json();
        setProducts(list);
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        router.replace('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {user?.username}!</h1>
          <p className="text-gray-600">
            Role: <em>{user?.role}</em> | Email: <strong>{user?.email}</strong>
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            router.replace('/login');
          }}
          className="bg-red-300 text-white px-4 py-2 rounded hover:bg-red-700 transition"
        >
          Log Out
        </button>
      </header>

      <main className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Products</h2>
        {products.length === 0 ? (
          <p className="text-gray-500">No products found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-6">
            {products.map((prod) => (
             <div key={prod._id} className="bg-white p-4 rounded shadow">
  {prod.media[0] ? (
    prod.media[0].type === 'image' ? (
      <img
        src={`${process.env.NEXT_PUBLIC_API_URL}${prod.media[0].url}`}
        alt={prod.name}
        className="w-full h-40 object-cover rounded mb-3"
      />
    ) : prod.media[0].type === 'video' ? (
      <video
        src={`${process.env.NEXT_PUBLIC_API_URL}${prod.media[0].url}`}
        controls
        className="w-full h-40 object-cover rounded mb-3"
      >
        Your browser does not support the video tag.
      </video>
    ) : null
  ) : (
    <div className="w-full h-40 bg-gray-200 rounded mb-3 flex items-center justify-center text-gray-500">
      No Image
    </div>
  )}

  <h3 className="text-lg font-bold">{prod.name}</h3>
  <p className="text-gray-700">{prod.description}</p>

  {prod.rrp != null && (
    <p className="mt-2 text-blue-600 font-semibold">
      £{prod.rrp.toFixed(2)}
    </p>
  )}
  <p className="mt-1 text-sm text-gray-500">SKU: {prod.sku}</p>
</div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
