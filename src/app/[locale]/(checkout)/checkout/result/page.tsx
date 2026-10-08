import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import ResultView from "./result-view";

export default async function ResultPage({ params }: PageProps<"/[locale]/checkout/result">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<p className="p-10">…</p>}>
      <ResultView />
    </Suspense>
  );
}
