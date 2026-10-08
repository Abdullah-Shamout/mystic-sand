// Pass-through root layout: <html> lives in app/[locale]/layout.tsx so that
// lang/dir can follow the locale. Files outside [locale] (the root splash and
// the 404) render their own <html>.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
