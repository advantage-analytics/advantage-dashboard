"use client";

import { useState } from "react";
import Link from "next/link";

interface FormFieldProps {
  label: string;
  placeholder?: string;
  type?: string;
  hasError?: boolean;
  rightLabel?: { text: string; href?: string };
  showPasswordToggle?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
}

export default function FormField({
  label,
  placeholder,
  type = "text",
  hasError = false,
  rightLabel,
  showPasswordToggle = false,
  value,
  onChange,
  id,
  name,
  required,
  autoComplete,
}: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputType = showPasswordToggle
    ? showPassword
      ? "text"
      : "password"
    : type;

  return (
    <div className="group flex flex-col gap-[6px]">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-text-muted)]"
        >
          {label}
        </label>
        {rightLabel ? (
          <Link
            href={rightLabel.href || "#"}
            className="text-[11px] text-[var(--color-accent-blue)] transition-colors hover:text-[var(--color-accent-blue-hover)]"
          >
            {rightLabel.text}
          </Link>
        ) : null}
      </div>
      <div className="flex w-full items-center justify-between pb-[10px]">
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className="w-full bg-transparent text-[14px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
        />
        {showPasswordToggle ? (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text-secondary)]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      <div
        className={
          hasError
            ? "h-[1px] w-full bg-[var(--color-error)]"
            : "h-[1px] w-full bg-[var(--color-border-subtle)] transition-all duration-300 group-focus-within:h-[2px] group-focus-within:bg-[var(--color-accent-blue)]"
        }
      />
    </div>
  );
}
