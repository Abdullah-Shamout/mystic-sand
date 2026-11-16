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
