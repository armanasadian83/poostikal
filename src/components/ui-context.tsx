'use client';

import { createContext, useContext } from 'react';

export type Panel = 'search' | 'cart' | 'quiz' | 'saved' | 'brands' | 'account' | 'menu' | 'checkout' | null;
export const UIContext = createContext<{ openPanel: (panel: Panel) => void; toast: (message: string) => void }>({ openPanel: () => {}, toast: () => {} });
export const useUI = () => useContext(UIContext);
