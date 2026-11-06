import type { Order, OrderItem, Category, Product, RestaurantTable, Zone, AppUser, CartItem, AdminEntity, Settings } from '../types';
function api() {
 if(!window.electronAPI) throw new Error("Ouvrez l'application Windows pour accéder à PostgreSQL local.");
 // contextBridge freezes its API object. Wrap a copy to respect Proxy invariants.
 return new Proxy({...window.electronAPI}, {get(target,key) {
   const method=Reflect.get(target,key);
   if(typeof method!=='function')return method;
   return (...args: unknown[])=>method(...args).catch((error: unknown)=>{
     if(String(error).includes('[AUTH]'))window.dispatchEvent(new Event('pos-session-expired'));
     throw error;
   });
 }});
}
export const getSettings = () => api().getSettings();
export const getUsers = (): Promise<AppUser[]> => api().getUsers();
export const getCategories = (): Promise<Category[]> => api().getCategories();
export const getProducts = (id?: string): Promise<Product[]> => api().getProducts(id);
export const getTables = (): Promise<RestaurantTable[]> => api().getTables();
export const getFloor = () => api().getFloor();
export const getZones = (): Promise<Zone[]> => api().getZones();
export const getOrders = (status?: string): Promise<Order[]> => api().getOrders(status);
export const getOrderItems = (id: string): Promise<OrderItem[]> => api().getOrderItems(id);
export const createOrder = (order: Partial<Order>): Promise<Order> => api().createOrder(order);
export const saveOrder = (id: string,items: CartItem[],paid: number | undefined,version: number): Promise<Order> => api().saveOrder(id,items,paid,version);
export const getOrder = (id: string) => api().getOrder(id);
export const cancelOrder = (id: string,version: number,reason: string) => api().cancelOrder(id,version,reason);
export const getAdminData = () => api().getAdminData();
export const getPosServerInfo = () => api().getPosServerInfo();
export const setDeviceActive = (id:string,active:boolean) => api().setDeviceActive(id,active);
export const saveEntity = (entity: AdminEntity,input: unknown) => api().saveEntity(entity,input);
export const archiveEntity = (entity: AdminEntity,id: string) => api().archiveEntity(entity,id);
export const saveSettings = (settings: Settings) => api().saveSettings(settings);
export const getBackupStatus = () => api().getBackupStatus();
export const backupNow = () => api().backupNow();
export function getClosedOrdersForDate(date: Date): Promise<Order[]> {
 const from=new Date(date);from.setHours(0,0,0,0); const to=new Date(from);to.setDate(to.getDate()+1);
 return api().getOrders('closed',from.toISOString(),to.toISOString());
}
export async function getOrderItemsForProductNames(ids: string[]) {return (await Promise.all(ids.map(getOrderItems))).flat();}
