import { createJSONStorage, type StateStorage } from "zustand/middleware";

// localStorage wrapper for the persisted stores. zustand does not catch a failing setItem,
// so a full quota would crash the store (and the page). This wrapper swallows every error,
// announces a full store once, and lets the app carry on with whatever is already saved.

export const STORAGE_FULL_EVENT = "ms:storage-full";

const notifyFull = () => {
  try {
    window.dispatchEvent(new Event(STORAGE_FULL_EVENT));
  } catch {
    // no window (server) or events blocked
  }
};

const guardedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // QuotaExceededError or any other failure: never throw, just warn.
      notifyFull();
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

/** Drop-in replacement for createJSONStorage(() => localStorage) that never throws. */
export const safeJSONStorage = createJSONStorage(() => guardedStorage);

/** Character counts of all of localStorage and of just this app's ms- keys (client only). */
export function storageUsage(): { totalChars: number; msChars: number } {
  let totalChars = 0;
  let msChars = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const value = localStorage.getItem(key) ?? "";
      const size = key.length + value.length;
      totalChars += size;
      if (key.startsWith("ms-")) msChars += size;
    }
  } catch {
    // storage blocked
  }
  return { totalChars, msChars };
}
