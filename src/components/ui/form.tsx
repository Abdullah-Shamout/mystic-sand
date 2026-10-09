"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible form building blocks: visible labels, aria-invalid + aria-describedby
 * wired to hint/error text, 16px+ inputs (no iOS zoom), 44px+ touch targets.
 */

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  optional?: string;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
};

export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[14px] text-ink">
        <span>{label}</span>
        {optional && <span className="text-[12px] text-muted">{optional}</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-[13px] leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] leading-snug text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  "h-12 w-full border bg-paper px-3.5 text-ink placeholder:text-muted/70 transition-colors outline-none focus:border-ink aria-invalid:border-danger";

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, "border-line", className)} {...props} />;
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(control, "appearance-none border-line bg-paper pe-10", className)} {...props}>
        {children}
      </select>
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(control, "min-h-24 resize-y border-line py-3 leading-relaxed", className)}
        {...props}
      />
    );
  },
);

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "title"> & { label: React.ReactNode; description?: React.ReactNode }
>(function Checkbox({ label, description, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-1", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-1 size-[18px] shrink-0 cursor-pointer accent-racing"
        {...props}
      />
      <span className="flex flex-col gap-0.5 text-[15px] leading-snug">
        <span>{label}</span>
        {description && <span className="text-[13px] text-muted">{description}</span>}
      </span>
    </label>
  );
});

/** Large selectable card used for delivery and payment choices. */
export const RadioCard = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "title"> & {
    title: React.ReactNode;
    description?: React.ReactNode;
    aside?: React.ReactNode;
  }
>(function RadioCard({ title, description, aside, className, id, disabled, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex min-h-16 cursor-pointer items-start gap-3 border border-line bg-paper p-4 transition-colors",
        "has-[:checked]:border-ink has-[:checked]:bg-tile has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-racing",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="radio"
        disabled={disabled}
        className="mt-1 size-[18px] shrink-0 cursor-pointer accent-racing"
        {...props}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium leading-snug">{title}</span>
        {description && <span className="text-[13px] leading-snug text-muted">{description}</span>}
      </span>
      {aside && <span className="shrink-0">{aside}</span>}
    </label>
  );
});
