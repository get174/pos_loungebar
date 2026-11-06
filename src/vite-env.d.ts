/// <reference types="vite/client" />
import type { AppUser, Order, OrderItem, CartItem, Category, Product, RestaurantTable, Zone, AdminData, AdminEntity, Settings, BackupStatus } from './types';

declare global {
  interface Window {
    electronAPI: {
      getSession: () => Promise<AppUser | null>;
      logoutLocal: () => Promise<void>;
      changePassword: (currentPassword: string, newPassword: string) => Promise<AppUser>;
      saveOrder: (id: string, items: CartItem[], paid: number | undefined, version: number) => Promise<Order>;
      getOrder: (id: string) => Promise<Order>;
      printOrder: (id: string) => Promise<{success:boolean; cancelled:boolean}>;
      cancelOrder: (id: string, version: number, reason: string) => Promise<void>;
      getAdminData: () => Promise<AdminData>;
      getPosServerInfo: () => Promise<{urls:string[];pairingKey:string;host:string}>;
      setDeviceActive: (id:string,active:boolean) => Promise<void>;
      saveEntity: (entity: AdminEntity, input: unknown) => Promise<{id: string}>;
      archiveEntity: (entity: AdminEntity, id: string) => Promise<void>;
      saveSettings: (settings: Settings) => Promise<void>;
      getBackupStatus: () => Promise<BackupStatus>;
      backupNow: () => Promise<string | null>;
      getAppVersion: () => Promise<string>;
      isDev: () => Promise<boolean>;
      loginLocal: (username: string, password: string) => Promise<AppUser | null>;
      getSettings: () => Promise<Record<string, string>>;
      getUsers: () => Promise<AppUser[]>;
      getCategories: () => Promise<Category[]>;
      getZones: () => Promise<Zone[]>;
      getProducts: (categoryId?: string) => Promise<Product[]>;
      getTables: () => Promise<RestaurantTable[]>;
      getFloor: () => Promise<RestaurantTable[]>;
      getOrders: (status?: string, fromDate?: string, toDate?: string) => Promise<Order[]>;
      getOrderItems: (orderId: string) => Promise<OrderItem[]>;
      createOrder: (order: Partial<Order>) => Promise<Order>;
    };
  }
}

declare global {
  interface ImportMetaEnv {
    readonly VITE_USE_LOCAL_DB?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
