export interface AppUser {
  must_change_password: number;
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'cashier';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  is_active: boolean;
  is_favorite: boolean;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface RestaurantTable {
  can_edit?: boolean;
  id: string;
  name: string;
  zone_id: string | null;
  capacity: number;
  status: 'free' | 'occupied' | 'closed';
  sort_order: number;
  created_at: string;
  updated_at: string;
  zone?: Zone;
  current_order?: Order;
}

export interface Order {
  version: number;
  id: string;
  table_id: string | null;
  table_name: string;
  cashier_id: string | null;
  cashier_name: string;
  status: 'open' | 'closed' | 'cancelled';
  total: number;
  amount_paid: number;
  change_due: number;
  notes: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
  updated_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface Log {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  details: string;
  created_at: string;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Settings {
  receipt_width: '58' | '80';
  restaurant_name: string;
  currency: string;
  receipt_footer: string;
  address: string;
  phone: string;
}

export type AdminEntity = 'users' | 'products' | 'categories' | 'tables' | 'zones';
export interface AdminData {
  devices: {id:string;name:string;is_active:number;created_at:string}[];
  users: AppUser[];
  products: Product[];
  categories: Category[];
  tables: RestaurantTable[];
  zones: Zone[];
  logs: Log[];
}
export interface BackupStatus {
  directory: string;
  lastFile: string | null;
  lastError: string | null;
  running: boolean;
}
