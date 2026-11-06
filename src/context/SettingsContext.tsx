import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSettings } from '../lib/data';
import type { Settings } from '../types';

interface SettingsContextType {
  settings: Settings;
  refreshSettings: () => Promise<void>;
}

const defaults: Settings = {
  receipt_width: '80',
  restaurant_name: 'Le Lounge Bar',
  currency: 'FC',
  receipt_footer: 'Merci de votre visite !',
  address: '123 Avenue Principale',
  phone: '+243 XXX XXX XXX',
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaults,
  refreshSettings: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaults);

  const refreshSettings = async () => {
    const data = await getSettings();
    if (data) {
      setSettings({ ...defaults, ...data });
    }
  };

  useEffect(() => {
    const refresh=()=>{void refreshSettings().catch(() => {});};
    refresh();
    window.addEventListener('pos-settings-refresh',refresh);
    return ()=>window.removeEventListener('pos-settings-refresh',refresh);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
