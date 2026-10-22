import { CONFIG } from './config.js';

/** Sauvegarde locale tolérante aux erreurs (navigation privée, stockage bloqué…). */
export const storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKey)) ?? {};
    } catch {
      return {};
    }
  },

  save(data) {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({ ...this.load(), ...data }));
    } catch {
      /* stockage indisponible : on ignore */
    }
  },
};
