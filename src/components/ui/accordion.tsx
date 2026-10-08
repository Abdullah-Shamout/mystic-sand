"use client";

import { Minus, Plus } from "lucide-react";
import { Accordion as A } from "radix-ui";
import { cn } from "@/lib/cn";

export type AccordionItem = { id: string; title: React.ReactNode; content: React.ReactNode };

/** Amouage-style accordion: hairline separators, uppercase labels, +/− marker. */
export function Accordion({
  items,
  defaultOpen,
  className,
  tone = "light",
}: {
  items: AccordionItem[];
  defaultOpen?: string[];
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <A.Root type="multiple" defaultValue={defaultOpen} className={cn("w-full", className)}>
      {items.map((item) => (
        <A.Item
          key={item.id}
          value={item.id}
          className={cn("border-b", tone === "dark" ? "border-cream/25" : "border-line")}
        >
          <A.Header>
            <A.Trigger className="group caps flex w-full items-center justify-between gap-4 py-4 text-start text-[14px] font-normal">
              <span>{item.title}</span>
              <Plus className="size-4 shrink-0 group-data-[state=open]:hidden" strokeWidth={1.25} aria-hidden />
              <Minus className="hidden size-4 shrink-0 group-data-[state=open]:block" strokeWidth={1.25} aria-hidden />
            </A.Trigger>
          </A.Header>
          <A.Content className="overflow-hidden pb-5 text-[15px] leading-relaxed">{item.content}</A.Content>
        </A.Item>
      ))}
    </A.Root>
  );
}
