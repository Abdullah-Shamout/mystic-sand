import { z } from "zod";
import type { CatalogEdits } from "@/lib/catalog";
import type { StoreSettings } from "@/lib/settings";
import {
  clearUploadCache,
  listUploadIds,
  readUpload,
  saveUpload,
  StorageFullError,
  type Upload,
} from "@/lib/uploads";
import { useAdminStore } from "@/store/admin";
import { useCatalogStore } from "@/store/catalog";
import { useCheckout, type Order } from "@/store/checkout";
import { useSettingsStore } from "@/store/settings";

// One-file backup of everything the admin can change in this browser: the catalog edits, the
// store settings, the back-office state (fulfilment + sample orders), the real orders and the
// uploaded photos. The admin password hash (ms-admin-auth) is deliberately left out — a backup
// moves data between devices, not credentials.

export const BACKUP_APP = "mystic-sand";
export const BACKUP_VERSION = 1;

type AdminBackup = {
  fulfillment: Record<string, { doneAt: string }>;
  samples: Order[];
  samplesSeededAt: string | null;
  samplesCleared: boolean;
};

export type Backup = {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  catalog: CatalogEdits;
  settings: Partial<StoreSettings>;
  admin: AdminBackup;
  orders: Record<string, Order>;
  uploads: Record<string, Upload>;
};

/** Thrown when the file is not a valid Mystic Sand backup. The restore writes nothing. */
export class BackupError extends Error {
  constructor(message = "Invalid backup file") {
    super(message);
    this.name = "BackupError";
  }
}

/** Collects the current state of every store plus the uploaded photos into one object. */
export function buildBackup(): Backup {
  const uploads: Record<string, Upload> = {};
  for (const id of listUploadIds()) {
    const upload = readUpload(id);
    if (upload) uploads[id] = upload;
  }
  const admin = useAdminStore.getState();
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    catalog: useCatalogStore.getState().edits,
    settings: useSettingsStore.getState().overrides,
    admin: {
      fulfillment: admin.fulfillment,
      samples: admin.samples,
      samplesSeededAt: admin.samplesSeededAt,
      samplesCleared: admin.samplesCleared,
    },
    orders: useCheckout.getState().orders,
    uploads,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  w: z.number(),
  h: z.number(),
  kind: z.enum(["packshot", "photo"]),
  data: z.string(),
});

// The deep shapes (products, orders) are left lenient: buildCatalog repairs bad catalog data at
// read time, and resolveSettings validates settings per field, so only the top-level containers
// must be the right kind. A file that is the wrong shape is rejected before anything is written.
const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().optional(),
  catalog: z
    .object({
      patches: z.record(z.string(), z.unknown()).optional(),
      added: z.array(z.unknown()).optional(),
      categories: z.record(z.string(), z.unknown()).optional(),
    })
    .loose(),
  settings: z.record(z.string(), z.unknown()),
  admin: z.object({
    fulfillment: z.record(z.string(), z.unknown()).optional(),
    samples: z.array(z.unknown()).optional(),
    samplesSeededAt: z.string().nullish(),
    samplesCleared: z.boolean().optional(),
  }),
  orders: z.record(z.string(), z.unknown()),
  uploads: z.record(z.string(), uploadSchema),
});

const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function coerceEdits(value: unknown): CatalogEdits {
  const v = (value ?? {}) as Partial<CatalogEdits>;
  return {
    patches: isPlain(v.patches) ? (v.patches as CatalogEdits["patches"]) : {},
    added: Array.isArray(v.added) ? v.added : [],
    categories: isPlain(v.categories) ? (v.categories as CatalogEdits["categories"]) : {},
  };
}

/**
 * Restores a backup from its JSON text. Replaces the catalog edits, settings and admin data, and
 * merges the orders (adds or replaces by id) so a stale checkout draft is never lost. Throws
 * BackupError for an invalid file (nothing is written), or StorageFullError if the browser runs
 * out of room while writing the photos. Returns how many photos were restored.
 */
export function restoreBackup(raw: string): { uploads: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupError();
  }
  const result = backupSchema.safeParse(parsed);
  if (!result.success) throw new BackupError();
  const data = result.data;

  useCatalogStore.setState({ edits: coerceEdits(data.catalog) });
  useSettingsStore.setState({ overrides: data.settings as Partial<StoreSettings> });
  useAdminStore.setState({
    fulfillment: (data.admin.fulfillment as AdminBackup["fulfillment"]) ?? {},
    samples: (data.admin.samples as unknown as Order[]) ?? [],
    samplesSeededAt: data.admin.samplesSeededAt ?? null,
    samplesCleared: data.admin.samplesCleared ?? false,
  });
  useCheckout.setState({
    orders: { ...useCheckout.getState().orders, ...(data.orders as Record<string, Order>) },
  });

  let count = 0;
  try {
    for (const [id, upload] of Object.entries(data.uploads)) {
      saveUpload(id, upload);
      count += 1;
    }
  } finally {
    // New records go straight into the upload cache via saveUpload, but clear it anyway so any
    // ids that failed (StorageFullError) are not left as stale cache entries.
    clearUploadCache();
  }
  return { uploads: count };
}

export { StorageFullError };
