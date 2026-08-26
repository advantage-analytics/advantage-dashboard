"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ErrorText } from "./form-error";

interface FormFieldProps {
  label: string;
  placeholder?: string;
  type?: string;
  /**
   * Plain-language message for this field. Present means the rule turns red and
   * the message renders beneath it — the one error region the set spec allows.
   */
  error?: string | null;
  showPasswordToggle?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
  required?: boolean;
  autoComplete?: string;
}

/**
 * The DS v2 underline input — the same field vocabulary as the upload wizard
 * and settings, rather than the hand-built one auth used to carry.
 *
 * Differences from the as-built field: the value sits at the DS 14px instead of
 * 16px, the show/hide mark is at the DS 1.5px stroke instead of 2px, the label
 * reads at `--ink-500` instead of a sub-AA gray, and errors live here on the
 * field instead of in a tinted, shaking banner under the whole group.
 */
export default function FormField({
  label,
  placeholder,
  type = "text",
  error,
  showPasswordToggle = false,
  value,
  onChange,
  id,
  name,
  required,
  autoComplete,
}: FormFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const messageId = `${fieldId}-message`;

  const inputType = showPasswordToggle
    ? showPassword
      ? "text"
      : "password"
    : type;

  return (
    <div className="group flex flex-col gap-[8px]">
      <label
        htmlFor={fieldId}
        className="text-[10px] font-medium tracking-[2.5px] text-[var(--ink-500)] uppercase"
      >
        {label}
      </label>

      <div className="flex w-full items-center justify-between pb-[10px]">
        <input
          id={fieldId}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          data-focus-ring="none" /* the rule below carries focus */
          className="w-full bg-transparent text-[14px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />
        {showPasswordToggle ? (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="-my-3 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink-500)] transition-colors hover:text-[var(--ink-700)]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <Eye size={16} strokeWidth={1.5} />
            ) : (
              <EyeOff size={16} strokeWidth={1.5} />
            )}
          </button>
        ) : null}
      </div>

      {/* The rule carries the state: hairline at rest, 2px blue on focus, red on
          error. `!` on the focus-within colour: it and `group-hover`'s colour
          have equal specificity, so without it whichever Tailwind happens to
          emit last wins the cascade — and did, silently graying out the one
          indicator this field has for the ordinary case of clicking into it
          with a mouse (hover and focus true at once). Found verifying the
          neutral ring's removal below; not cosmetic. */}
      <div
        className={
          error
            ? "h-[1px] w-full bg-[var(--error)]"
            : "h-[1px] w-full bg-[var(--border-hairline)] transition-[height,background-color] duration-300 ease-[var(--ease-primary)] group-hover:bg-[var(--border-medium)] group-focus-within:h-[2px] group-focus-within:!bg-[var(--blue)]"
        }
      />

      {error ? <ErrorText id={messageId}>{error}</ErrorText> : null}
    </div>
  );
}
