"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAdminSession } from "@/lib/admin-auth";
import { useMounted } from "@/lib/hooks";
import { LoginDialog } from "./login-dialog";

/**
 * Last item of the header's end group, on every screen size (top-left in Arabic). It reads
 * "Enter" before mount and while signed out, opening the login popup; once signed in it
 * becomes an "Admin" link. Compact enough to fit the header from 360px wide.
 */
export function AdminEntry() {
  const t = useTranslations("common");
  const mounted = useMounted();
  const session = useAdminSession();
  const [open, setOpen] = useState(false);

  const className =
    "caps inline-flex min-h-11 items-center px-1.5 text-[13px] transition-opacity hover:opacity-70 lg:text-[14px]";

  if (mounted && session) {
    return (
      <Link href="/admin" className={className}>
        {t("header.admin")}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {t("header.enter")}
      </button>
      <LoginDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
