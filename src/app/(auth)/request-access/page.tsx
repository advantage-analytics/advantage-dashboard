"use client";

import { useState } from "react";
import Link from "next/link";
import FormHeader from "@/components/auth/form-header";
import FormField from "@/components/auth/form-field";
import AccentLine from "@/components/auth/accent-line";

export default function Page() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [university, setUniversity] = useState("");
  const [division, setDivision] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Simulate submission — replace with Supabase insert when ready
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="flex w-[360px] flex-col items-center gap-[24px]"
        style={{ animation: "fadeUp 0.5s ease-out" }}
      >
        <div className="w-full">
          <AccentLine />
        </div>

        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[rgba(0,0,0,0.03)]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-accent-blue)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <div className="flex w-full flex-col gap-[12px]">
          <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.5px] text-[var(--color-text-primary)]">
            Application Received.
          </h2>
          <p className="text-[13px] leading-[1.6] text-[var(--color-text-secondary)]">
            Thanks for your interest in Advantage. We&apos;ll review your
            application and get back to you via email.
          </p>
        </div>

        <Link href="/login" className="flex items-center gap-[6px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            Back to Sign In
          </span>
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-[360px] flex-col gap-[24px]"
      style={{ animation: "fadeUp 0.5s ease-out" }}
    >
      <FormHeader
        title="Request Access."
        description="Complete the form below to submit your application for early access."
        subtitle="Advantage is currently reviewing applications for the upcoming season."
      />

      {/* Fields */}
      <div className="flex flex-col gap-[20px]">
        {/* Name row */}
        <div className="flex gap-[16px]">
          <div className="flex-1">
            <FormField
              label="FIRST NAME"
              id="first-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <FormField
              label="LAST NAME"
              id="last-name"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>

        {/* University */}
        <FormField
          label="UNIVERSITY / COLLEGE"
          id="university"
          placeholder="e.g. Stanford University"
          value={university}
          onChange={(e) => setUniversity(e.target.value)}
          required
        />

        {/* Division & Role row */}
        <div className="flex gap-[16px]">
          {/* Division select */}
          <div className="flex flex-1 flex-col gap-[6px]">
            <label
              htmlFor="division"
              className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-text-muted)]"
            >
              NCAA DIVISION
            </label>
            <div className="pb-[10px]">
              <select
                id="division"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                required
                className="w-full appearance-none bg-transparent text-[14px] text-[var(--color-text-primary)] outline-none [&:invalid]:text-[var(--color-text-dim)]"
              >
                <option value="" disabled>
                  Select division
                </option>
                <option value="D1">Division I</option>
                <option value="D2">Division II</option>
                <option value="D3">Division III</option>
                <option value="NAIA">NAIA</option>
                <option value="JUCO">JUCO</option>
              </select>
            </div>
            <div className="h-[1px] bg-[var(--color-border-subtle)]" />
          </div>

          {/* Role select */}
          <div className="flex flex-1 flex-col gap-[6px]">
            <label
              htmlFor="role"
              className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-text-muted)]"
            >
              ROLE
            </label>
            <div className="pb-[10px]">
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                required
                className="w-full appearance-none bg-transparent text-[14px] text-[var(--color-text-primary)] outline-none [&:invalid]:text-[var(--color-text-dim)]"
              >
                <option value="" disabled>
                  Select role
                </option>
                <option value="student-athlete">Student athlete</option>
                <option value="coach">Coach</option>
                <option value="analyst">Analyst</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="h-[1px] bg-[var(--color-border-subtle)]" />
          </div>
        </div>

        {/* Email */}
        <FormField
          label="EMAIL ADDRESS"
          id="request-email"
          placeholder="name@university.edu"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        {/* Textarea */}
        <div className="flex flex-col gap-[6px]">
          <label
            htmlFor="reason"
            className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-text-muted)]"
          >
            WHY ADVANTAGE? (OPTIONAL)
          </label>
          <div className="h-[64px] pb-[8px]">
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us about your competitive background..."
              className="h-full w-full resize-none bg-transparent text-[14px] leading-[1.6] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-dim)]"
            />
          </div>
          <div className="h-[1px] bg-[var(--color-border-subtle)]" />
        </div>

        {/* Error message */}
        {error ? (
          <div
            className="flex w-full items-center gap-[8px] rounded-[6px] bg-[var(--color-error-bg)] px-[12px] py-[10px]"
            style={{ animation: "shake 0.4s ease-in-out" }}
            role="alert"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-error)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-[12px] leading-[1.4] text-[var(--color-error)]">
              {error}
            </span>
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-[18px]">
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--color-accent-blue)] text-[13px] font-medium tracking-[1px] text-white transition-all duration-200 hover:bg-[var(--color-accent-blue-hover)] hover:shadow-[0_0_20px_var(--color-accent-blue-glow)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        >
          {isLoading ? "Submitting..." : "Submit Application"}
        </button>

        <Link href="/login" className="flex items-center gap-[6px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            Back to Sign In
          </span>
        </Link>
      </div>
    </form>
  );
}
