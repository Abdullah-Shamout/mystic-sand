"use client";

import { useSearchParams } from "next/navigation";

export default function ResultView() {
  const search = useSearchParams();
  return <p className="p-10">order: {search.get("order")}</p>;
}
