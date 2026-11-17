"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { useLiveSettings } from "@/lib/live";
import { phoneStatus } from "@/lib/phone";
import { whatsappHref } from "@/lib/settings";
import { submitContact } from "@/server/actions/contact";
import { useUi } from "@/store/ui";

type ErrorKey = "nameRequired" | "phoneRequired" | "phoneInvalid" | "phoneLandline" | "messageRequired" | "messageShort" | "tooLong";
/** Server-side outcomes the form surfaces inline (the client validation handles the field-level ones). */
type ServerErrorKey = "throttled" | "invalid" | "generic";

// Labels come from the server page (messages/*/content.json), so the large `content`
// namespace never has to be shipped to the browser.
export type ContactFormLabels = {
  name: string;
  phone: string;
  phoneHint: string;
  message: string;
  messageHint: string;
  submit: string;
  errorSummary: string;
  errors: Record<ErrorKey, string>;
  successTitle: string;
  successText: string;
  successAnnounce: string;
  whatsappCta: string;
  whatsappGreeting: string;
  another: string;
  newTab: string;
  serverErrors: Record<ServerErrorKey, string>;
};

type Values = { name: string; phone: string; message: string };
type Errors = Partial<Record<keyof Values, ErrorKey>>;

const FIELDS = ["name", "phone", "message"] as const;
const NAME_MAX = 80;
const MESSAGE_MAX = 1000;
const empty: Values = { name: "", phone: "", message: "" };

function validate(v: Values): Errors {
  const errors: Errors = {};
  const name = v.name.trim();
  if (name.length < 2) errors.name = "nameRequired";
  else if (name.length > NAME_MAX) errors.name = "tooLong";

  const phone = phoneStatus(v.phone);
  if (phone === "empty") errors.phone = "phoneRequired";
  else if (phone === "landline") errors.phone = "phoneLandline";
  else if (phone === "invalid") errors.phone = "phoneInvalid";

  const message = v.message.trim();
  if (!message) errors.message = "messageRequired";
  else if (message.length < 10) errors.message = "messageShort";
  else if (message.length > MESSAGE_MAX) errors.message = "tooLong";
  return errors;
}

/**
 * Contact form with client-side validation (on blur and on submit). A valid submission is sent to the
 * `submitContact` server action (persisted + a best-effort notification); on success it is confirmed in
 * place and announced, with a one-tap hand-off of the same message to WhatsApp. A server rejection
 * (throttled / invalid / generic) shows an inline error and keeps the WhatsApp fallback usable.
 */
export function ContactForm({ labels, locale }: { labels: ContactFormLabels; locale: "en" | "ar" }) {
  const announce = useUi((s) => s.announce);
  const settings = useLiveSettings();
  const [values, setValues] = useState<Values>(empty);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [sent, setSent] = useState<Values | null>(null);
  const [serverError, setServerError] = useState<ServerErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const errors = validate(values);
  const errorFor = (field: keyof Values) => {
    const key = touched[field] || attempted ? errors[field] : undefined;
    return key ? labels.errors[key] : undefined;
  };
  const hasErrors = FIELDS.some((f) => errors[f]);

  const bind = (field: keyof Values) => ({
    name: field,
    value: values[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setAttempted(true);
    const first = FIELDS.find((f) => errors[f]);
    if (first) {
      ({ name: nameRef, phone: phoneRef, message: messageRef })[first].current?.focus();
      return;
    }
    const payload: Values = { name: values.name.trim(), phone: values.phone, message: values.message.trim() };
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await submitContact({ ...payload, locale });
        if (res.ok) {
          setSent(payload);
          announce(labels.successAnnounce);
        } else {
          // throttled / invalid / generic — show the error inline; the WhatsApp fallback stays usable.
          setServerError(res.reason);
        }
      } catch {
        // A network / transport failure must not escape to the error boundary (it would take the
        // WhatsApp fallback with it) — degrade to the generic inline error.
        setServerError("generic");
      }
    });
  };

  if (sent) {
    const text = `${labels.whatsappGreeting}\n\n${sent.message}\n\n— ${sent.name}`;
    return (
      <div className="flex flex-col items-start gap-4">
        <h3 ref={successRef} tabIndex={-1} className="caps font-serif text-title-sm font-medium outline-none">
          {labels.successTitle}
        </h3>
        <p className="text-[15px] leading-relaxed text-ink/80">{labels.successText}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Button asChild>
            <a href={whatsappHref(settings, text)} target="_blank" rel="noreferrer">
              <WhatsAppIcon className="size-4" />
              {labels.whatsappCta}
              <span className="sr-only">({labels.newTab})</span>
            </a>
          </Button>
          <button
            type="button"
            onClick={() => {
              setSent(null);
              setValues(empty);
              setTouched({});
              setAttempted(false);
            }}
            className="min-h-11 text-[14px] underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            {labels.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-6">
      {attempted && hasErrors && (
        <p role="alert" className="border-s-2 border-danger bg-danger/5 px-4 py-3 text-[14px] text-danger">
          {labels.errorSummary}
        </p>
      )}
      <Field label={labels.name} error={errorFor("name")}>
        {({ id, describedBy, invalid }) => (
          <TextInput
            ref={nameRef}
            id={id}
            {...bind("name")}
            autoComplete="name"
            maxLength={NAME_MAX}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Field label={labels.phone} hint={labels.phoneHint} error={errorFor("phone")}>
        {({ id, describedBy, invalid }) => (
          <div dir="ltr" className="flex">
            <span
              aria-hidden
              className="figures inline-flex h-12 shrink-0 items-center border border-e-0 border-line bg-tile px-3.5 text-[16px] text-muted"
            >
              +965
            </span>
            <TextInput
              ref={phoneRef}
              id={id}
              {...bind("phone")}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              maxLength={16}
              className="figures min-w-0 flex-1"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          </div>
        )}
      </Field>
      <Field label={labels.message} hint={labels.messageHint} error={errorFor("message")}>
        {({ id, describedBy, invalid }) => (
          <TextArea
            ref={messageRef}
            id={id}
            {...bind("message")}
            rows={5}
            dir="auto"
            maxLength={MESSAGE_MAX}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      {serverError && (
        <div
          role="alert"
          data-testid="contact-server-error"
          className="border-s-2 border-danger bg-danger/5 px-4 py-3 text-[14px] text-danger"
        >
          <p>{labels.serverErrors[serverError]}</p>
          <a
            href={whatsappHref(settings, `${labels.whatsappGreeting}\n\n${values.message.trim()}\n\n— ${values.name.trim()}`)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            <WhatsAppIcon className="size-4" />
            {labels.whatsappCta}
            <span className="sr-only">({labels.newTab})</span>
          </a>
        </div>
      )}
      <Button type="submit" size="lg" block busy={pending}>
        {labels.submit}
      </Button>
    </form>
  );
}
