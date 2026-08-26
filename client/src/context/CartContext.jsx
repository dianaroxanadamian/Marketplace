import { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'fagure_cart'; // [{ productId, title, price, image, quantity }]

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }, [items]);

  const add = (product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        productId: product.id,
        title: product.ai_title,
        price: product.raw_price,
        image: product.imagePaths?.[0],
        quantity: 1,
      }];
    });
  };

  const setQuantity = (productId, quantity) => {
    setItems((prev) => quantity <= 0
      ? prev.filter((i) => i.productId !== productId)
      : prev.map((i) => i.productId === productId ? { ...i, quantity } : i));
  };

  const remove = (productId) => setItems((prev) => prev.filter((i) => i.productId !== productId));
  const clear = () => setItems([]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, setQuantity, clear, count, total }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
