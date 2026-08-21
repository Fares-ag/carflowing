import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartVehicle {
  id: string
  name: string
  make: string
  fuelType?: string
  transmission?: string
  seats?: number
  image?: string
  pricePerDay?: number
}

export interface CartItem {
  vehicleId: string
  vehicleName: string
  vehicleMake: string
  durationLabel: string
  durationMonths: number
  quantity: number
  startDate: string
  notes: string
  subtotal: number
  total: number
}

interface CartState {
  vehicle: CartVehicle | null
  cart: CartItem | null
  setVehicle: (vehicle: CartVehicle | null) => void
  setCart: (cart: CartItem | null) => void
  clearCart: () => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      vehicle: null,
      cart: null,
      setVehicle: (vehicle) => set({ vehicle, cart: null }),
      setCart: (cart) => set({ cart }),
      clearCart: () => set({ vehicle: null, cart: null }),
    }),
    { name: 'carflow-cart', version: 2 }
  )
)
