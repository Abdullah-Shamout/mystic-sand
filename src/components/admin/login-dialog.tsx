"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { LoginForm } from "./login-form";

/**
 * The header "Enter" popup. Radix only renders the content (and its textboxes) while open, so the
 * closed storefront keeps zero textboxes. The form submits to the `login` action and hard-navigates
 * to the admin on success; closing the dialog here is just cleanup for that brief moment.
 */
export function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("common");

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("login.title")}>
      <div className="px-6 pb-8 pt-5">
        <LoginForm onSuccess={() => onOpenChange(false)} />
      </div>
    </Modal>
  );
}
