"use client";

import { AlertTriangle, Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { BackupError, buildBackup, restoreBackup, StorageFullError } from "@/lib/admin/backup";
import { type Catalog } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/download";
import { useLiveCatalog } from "@/lib/live";
import { storageUsage } from "@/lib/storage";
import { deleteUpload, isUploadKey, listUploadIds, readUpload, UPLOAD_PREFIX } from "@/lib/uploads";
import { useAdminStore } from "@/store/admin";
import { useCatalogStore } from "@/store/catalog";
import { useSettingsStore } from "@/store/settings";
import { useStockStore } from "@/store/stock";
import { useUi } from "@/store/ui";
import { groupNumber, SettingsCard } from "./settings-ui";

const STORAGE_BUDGET = 5_000_000;
const WARN_AT = 0.8;

type ConfirmKind = "restore" | "resetProducts" | "resetSettings" | "deletePhotos";

/** Every upload key referenced by any product in the catalog. */
function referencedUploads(catalog: Catalog): Set<string> {
  const keys = new Set<string>();
  for (const p of catalog.products) {
    for (const key of [p.images.card, p.images.hover, ...p.images.gallery]) {
      if (key && isUploadKey(key)) keys.add(key);
    }
  }
  return keys;
}

export function DataSection() {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);
  const catalog = useLiveCatalog();
  const samples = useAdminStore((s) => s.samples);

  // Recompute storage / photo figures after each action that writes localStorage.
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);

  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usage = useMemo(() => {
    void tick;
    void samples.length; // recompute once the sample orders finish seeding
    void catalog; // and when the catalog edits change
    return storageUsage();
  }, [tick, samples.length, catalog]);
  const percent = Math.min(100, Math.round((usage.totalChars / STORAGE_BUDGET) * 100));
  const warn = usage.totalChars >= STORAGE_BUDGET * WARN_AT;

  const unused = useMemo(() => {
    void tick;
    const referenced = referencedUploads(catalog);
    const ids = listUploadIds().filter((id) => !referenced.has(`${UPLOAD_PREFIX}${id}`));
    let size = 0;
    for (const id of ids) {
      const upload = readUpload(id);
      if (upload) size += JSON.stringify(upload).length + id.length;
    }
    return { ids, size };
  }, [catalog, tick]);

  // ── Actions ──
  const downloadBackup = () => {
    const json = JSON.stringify(buildBackup(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `mystic-sand-backup-${date}.json`);
    pushToast({ title: t("settings.data.backup.downloaded") });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPendingRestore(await file.text());
      setConfirm("restore");
    } catch {
      pushToast({ title: t("settings.data.backup.invalid") });
    }
  };

  const doRestore = () => {
    const raw = pendingRestore;
    setPendingRestore(null);
    if (raw === null) return;
    try {
      restoreBackup(raw);
      bump();
      pushToast({ title: t("settings.data.backup.restored") });
    } catch (error) {
      if (error instanceof StorageFullError) pushToast({ title: t("settings.data.backup.storageFull") });
      else if (error instanceof BackupError) pushToast({ title: t("settings.data.backup.invalid") });
      else pushToast({ title: t("settings.data.backup.invalid") });
    }
  };

  const clearSamples = () => {
    useAdminStore.getState().clearSamples();
    bump();
    pushToast({ title: t("settings.data.samples.cleared") });
  };
  const restoreSamples = () => {
    useAdminStore.getState().restoreSamples(new Date().toISOString());
    pushToast({ title: t("settings.data.samples.restored") });
  };

  const resetProducts = () => {
    useCatalogStore.getState().resetAll();
    // The stock ledger is part of the catalog edits: clearing one clears the other.
    useStockStore.getState().resetAll();
    bump();
    pushToast({ title: t("settings.data.reset.productsDone") });
  };
  const resetSettings = () => {
    useSettingsStore.getState().resetAll();
    pushToast({ title: t("settings.data.reset.settingsDone") });
  };

  const deletePhotos = () => {
    for (const id of unused.ids) deleteUpload(id);
    const count = unused.ids.length;
    bump();
    pushToast({ title: t("settings.data.photos.deleted", { count }) });
  };

  // ── Confirm dialog config ──
  const confirmProps = (() => {
    switch (confirm) {
      case "restore":
        return {
          title: t("settings.data.backup.confirmTitle"),
          message: t("settings.data.backup.confirmMessage"),
          confirmLabel: t("settings.data.backup.confirmAccept"),
          danger: false,
          onConfirm: doRestore,
        };
      case "resetProducts":
        return {
          title: t("settings.data.reset.productsConfirmTitle"),
          message: t("settings.data.reset.productsConfirmMessage"),
          confirmLabel: t("settings.data.reset.confirm"),
          danger: true,
          onConfirm: resetProducts,
        };
      case "resetSettings":
        return {
          title: t("settings.data.reset.settingsConfirmTitle"),
          message: t("settings.data.reset.settingsConfirmMessage"),
          confirmLabel: t("settings.data.reset.confirm"),
          danger: true,
          onConfirm: resetSettings,
        };
      case "deletePhotos":
        return {
          title: t("settings.data.photos.confirmTitle"),
          message: t("settings.data.photos.confirmMessage", { count: unused.ids.length }),
          confirmLabel: t("settings.data.photos.confirm"),
          danger: true,
          onConfirm: deletePhotos,
        };
      default:
        return null;
    }
  })();

  return (
    <SettingsCard title={t("settings.data.title")} intro={t("settings.data.intro")}>
      {/* Storage meter */}
      <div>
        <h3 className="caps text-[13px] font-medium">{t("settings.data.storage.title")}</h3>
        <div className="mt-2 h-2 w-full overflow-hidden bg-tile" role="presentation">
          <div className={cn("h-full", warn ? "bg-danger" : "bg-racing")} style={{ width: `${percent}%` }} />
        </div>
        <p className="figures mt-1.5 text-[12px] text-muted">
          {t("settings.data.storage.used", { percent })}
          {" · "}
          {t("settings.data.storage.detail", {
            total: groupNumber(usage.totalChars),
            ms: groupNumber(usage.msChars),
          })}
        </p>
        {warn && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-danger">
            <AlertTriangle className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            {t("settings.data.storage.warn")}
          </p>
        )}
      </div>

      {/* Backup / restore */}
      <DataBlock title={t("settings.data.backup.title")} intro={t("settings.data.backup.intro")}>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={downloadBackup} data-testid="backup-download">
            <Download className="size-4" strokeWidth={1.5} aria-hidden />
            {t("settings.data.backup.download")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} data-testid="backup-restore">
            <Upload className="size-4" strokeWidth={1.5} aria-hidden />
            {t("settings.data.backup.restore")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onFile}
            data-testid="backup-file"
          />
        </div>
      </DataBlock>

      {/* Sample orders */}
      <DataBlock title={t("settings.data.samples.title")} intro={t("settings.data.samples.intro")}>
        <p className="text-[13px] text-ink" data-testid="samples-count">
          {t("settings.data.samples.count", { count: samples.length })}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={clearSamples}
            disabled={samples.length === 0}
            data-testid="samples-clear"
          >
            {t("settings.data.samples.clear")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={restoreSamples}
            disabled={samples.length > 0}
            data-testid="samples-restore"
          >
            {t("settings.data.samples.restore")}
          </Button>
        </div>
      </DataBlock>

      {/* Unused photos */}
      <DataBlock title={t("settings.data.photos.title")} intro={t("settings.data.photos.intro")}>
        <p className="text-[13px] text-ink" data-testid="photos-count">
          {t("settings.data.photos.count", { count: unused.ids.length, size: groupNumber(unused.size) })}
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirm("deletePhotos")}
            disabled={unused.ids.length === 0}
            data-testid="photos-delete"
          >
            {t("settings.data.photos.delete")}
          </Button>
        </div>
      </DataBlock>

      {/* Resets */}
      <DataBlock title={t("settings.data.reset.title")}>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm("resetProducts")} data-testid="reset-products">
            {t("settings.data.reset.products")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm("resetSettings")} data-testid="reset-settings">
            {t("settings.data.reset.settings")}
          </Button>
        </div>
      </DataBlock>

      {confirmProps && (
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => {
            if (!open) {
              setConfirm(null);
              setPendingRestore(null);
            }
          }}
          title={confirmProps.title}
          message={confirmProps.message}
          confirmLabel={confirmProps.confirmLabel}
          danger={confirmProps.danger}
          onConfirm={confirmProps.onConfirm}
        />
      )}
    </SettingsCard>
  );
}

function DataBlock({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-5">
      <h3 className="caps text-[13px] font-medium">{title}</h3>
      {intro && <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-muted">{intro}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
