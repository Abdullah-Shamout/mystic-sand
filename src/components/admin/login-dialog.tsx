"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { useRouter } from "@/i18n/navigation";
import { useUi } from "@/store/ui";
import { LoginForm } from "./login-form";

/**
 * The header "Enter" popup. Radix only renders the content (and its textboxes) while open,
 * so the closed storefront keeps zero textboxes. On success it heads to the admin area.
 */
export function LoginDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pushToast = useUi((s) => s.pushToast);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t("login.title")}>
      <div className="px-6 pb-8 pt-5">
        <LoginForm
          onSuccess={() => {
            onOpenChange(false);
            pushToast({ title: t("login.signedIn") });
            router.push("/admin");
          }}
        />
      </div>
    </Modal>
  );
}
