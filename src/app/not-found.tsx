import type { Metadata } from "next";
import { BASE_PATH } from "@/lib/asset";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found · Mystic Sand",
  robots: { index: false, follow: false },
};

// A static export emits a single 404.html, so it speaks both languages.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-paper px-6 text-center text-ink">
        <p className="font-serif text-2xl tracking-[0.2em]">MYSTIC SAND</p>
        <div className="space-y-2">
          <h1 className="font-serif text-4xl">Page not found</h1>
          <p className="text-muted">The sand has shifted — this page no longer exists.</p>
        </div>
        <div className="space-y-2" lang="ar" dir="rtl">
          <h2 className="text-3xl">الصفحة غير موجودة</h2>
          <p className="text-muted">لم نعثر على الصفحة التي تبحث عنها.</p>
        </div>
        <nav className="flex gap-8 text-sm">
          <a className="underline underline-offset-4" href={`${BASE_PATH}/en/`}>
            Back to the shop
          </a>
          <a className="underline underline-offset-4" href={`${BASE_PATH}/ar/`} lang="ar">
            العودة إلى المتجر
          </a>
        </nav>
      </body>
    </html>
  );
}
