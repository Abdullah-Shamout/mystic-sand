"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/form";
import { whatsappLink } from "@/data/site";
import { phoneStatus } from "@/lib/phone";
import { useUi } from "@/store/ui";

type ErrorKey = "nameRequired" | "phoneRequired" | "phoneInvalid" | "phoneLandline" | "messageRequired" | "messageShort" | "tooLong";

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
 * Contact form with client-side validation (on blur and on submit). There is no backend
 * in the prototype: a valid message is confirmed in place and announced, with a one-tap
 * hand-off of the same message to WhatsApp.
 */
export function ContactForm({ labels }: { labels: ContactFormLabels }) {
  const announce = useUi((s) => s.announce);
  const [values, setValues] = useState<Values>(empty);
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [sent, setSent] = useState<Values | null>(null);
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
    setAttempted(true);
    const first = FIELDS.find((f) => errors[f]);
    if (first) {
      ({ name: nameRef, phone: phoneRef, message: messageRef })[first].current?.focus();
      return;
    }
    setSent({ name: values.name.trim(), phone: values.phone, message: values.message.trim() });
    announce(labels.successAnnounce);
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
            <a href={whatsappLink(text)} target="_blank" rel="noreferrer">
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
      <Button type="submit" size="lg" block>
        {labels.submit}
      </Button>
    </form>
  );
}
