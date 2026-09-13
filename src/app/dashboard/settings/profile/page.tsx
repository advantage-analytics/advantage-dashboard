"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSelect } from "@/components/dashboard/settings/settings-select";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { ProfileWelcomeBanner } from "@/components/dashboard/settings/profile-welcome-banner";
import { ProfileIdentityCard } from "@/components/dashboard/settings/profile-identity-card";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";
import { saveProfile } from "@/components/dashboard/settings/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]/40";

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "birthdate",
  "phone",
  "country",
  "state",
  "role",
] as const;

const REQUIRED_FIELDS = new Set<(typeof PROFILE_FIELDS)[number]>([
  "phone",
  "birthdate",
  "country",
  "state",
  "role",
]);

const FIELD_LABELS: Record<(typeof PROFILE_FIELDS)[number], string> = {
  firstName: "First Name",
  lastName: "Last Name",
  birthdate: "Date of Birth",
  phone: "Phone",
  country: "Country",
  state: "State / Region",
  role: "Role",
};

const COUNTRY_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "ES", label: "Spain" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "IT", label: "Italy" },
  { value: "AR", label: "Argentina" },
  { value: "BR", label: "Brazil" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "IN", label: "India" },
  { value: "MX", label: "Mexico" },
  { value: "CH", label: "Switzerland" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "CZ", label: "Czech Republic" },
  { value: "OTHER", label: "Other" },
];

const ROLE_OPTIONS = [
  { value: "player", label: "Player" },
  { value: "coach", label: "Coach" },
  { value: "parent", label: "Parent" },
  { value: "academy", label: "Academy" },
];

export default function ProfilePage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    birthdate: "",
    phone: "",
    country: "",
    state: "",
    role: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("profile-onboarding-dismissed") === "true";
  });
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform: string } })
        .userAgentData?.platform ?? navigator.platform;
    setIsMac(/mac/i.test(platform));
  }, []);

  // Initial load — fetch the user's profile row from public.users.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("users")
        .select("first_name, last_name, dob, phone, country, state, role")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      if (data) {
        setFormData({
          firstName: data.first_name ?? "",
          lastName: data.last_name ?? "",
          birthdate: data.dob ?? "",
          phone: data.phone ?? "",
          country: data.country ?? "",
          state: data.state ?? "",
          role: data.role ?? "",
        });
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { setHasUnsavedChanges } = useUnsavedChanges();

  useEffect(() => {
    setHasUnsavedChanges(hasChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasChanges, setHasUnsavedChanges]);

  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const completionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChangesRef.current && !loadingRef.current) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { completedCount, missingFields } = useMemo(() => {
    const missing: { id: string; label: string }[] = [];
    let count = 0;
    for (const f of PROFILE_FIELDS) {
      if (formData[f]?.trim()) count++;
      else missing.push({ id: f, label: FIELD_LABELS[f] });
    }
    return { completedCount: count, missingFields: missing };
  }, [formData]);

  const isComplete = completedCount === PROFILE_FIELDS.length;
  const isNewUser = completedCount === 0 && !bannerDismissed;
  const completionVisible = profileCompleted && isComplete && !hasChanges;
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (completionVisible && !wasVisibleRef.current) {
      completionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
    wasVisibleRef.current = completionVisible;
  }, [completionVisible]);

  const realName = `${formData.firstName} ${formData.lastName}`.trim();
  const displayName =
    realName || (isNewUser ? "Welcome" : "Add your name");
  // The "Welcome" greeting is real copy, not a placeholder — only italicize
  // the "Add your name" fallback so it reads as missing data.
  const isPlaceholderName = !realName && !isNewUser;
  const showBanner = loaded && !isComplete && !bannerDismissed;

  const roleLabel = useMemo(
    () => ROLE_OPTIONS.find((r) => r.value === formData.role)?.label,
    [formData.role]
  );

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setMessage(null);
  }, []);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
    localStorage.setItem("profile-onboarding-dismissed", "true");
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await saveProfile(formData);
      if (result.ok) {
        setMessage({ type: "success", text: "Profile saved" });
        if (isComplete) setProfileCompleted(true);
        setHasChanges(false);
      } else {
        setMessage({
          type: "error",
          text: result.error || "Couldn't save your profile. Try again.",
        });
      }
    } catch {
      setMessage({
        type: "error",
        text: "Couldn't save your profile. Check your connection and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl flex flex-col gap-10">
      {/* Identity block — hides its own completion meter when the banner
          is visible, so progress is only signaled in one place. */}
      <ProfileIdentityCard
        displayName={displayName}
        isPlaceholderName={isPlaceholderName}
        email={email}
        roleLabel={roleLabel}
        completedCount={completedCount}
        totalCount={PROFILE_FIELDS.length}
        showCompletion={!showBanner}
      />

      {/* Onboarding Banner — gated on `loaded` so it doesn't flash with
          "0 of 7 complete" before Supabase data lands. */}
      {showBanner && (
        <ProfileWelcomeBanner
          completedCount={completedCount}
          totalCount={PROFILE_FIELDS.length}
          missingFields={missingFields}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* Message */}
      {message && (
        <SettingsAlert
          type={message.type}
          message={message.text}
          onDismiss={() => setMessage(null)}
        />
      )}

      {/* General Information */}
      <SettingsSection
        number="01"
        title="General Information"
        description="Your name, contact, and date of birth."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SettingsInput
            id="firstName"
            label="First Name"
            type="text"
            skeleton={!loaded}
            skeletonWidth="sm"
            skeletonIndex={0}
            value={formData.firstName}
            onChange={(e) => handleInputChange("firstName", e.target.value)}
            placeholder="First name"
          />
          <SettingsInput
            id="lastName"
            label="Last Name"
            type="text"
            skeleton={!loaded}
            skeletonWidth="md"
            skeletonIndex={1}
            value={formData.lastName}
            onChange={(e) => handleInputChange("lastName", e.target.value)}
            placeholder="Last name"
          />
        </div>
        <SettingsInput
          id="birthdate"
          label="Date of Birth"
          type="date"
          skeleton={!loaded}
          skeletonWidth="md"
          skeletonIndex={2}
          required={REQUIRED_FIELDS.has("birthdate")}
          value={formData.birthdate}
          onChange={(e) => handleInputChange("birthdate", e.target.value)}
          hint="For age-group statistics."
        />
        <SettingsInput
          id="phone"
          label="Phone Number"
          type="tel"
          inputMode="tel"
          skeleton={!loaded}
          skeletonWidth="lg"
          skeletonIndex={3}
          required={REQUIRED_FIELDS.has("phone")}
          value={formData.phone}
          onChange={(e) => handleInputChange("phone", e.target.value)}
          placeholder="+1 555 000 0000"
          hint="For account recovery and match notifications"
        />
      </SettingsSection>

      {/* Tennis Profile */}
      <SettingsSection
        number="02"
        title="Tennis Profile"
        description="Where you play and how you use Advantage."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SettingsSelect
            id="country"
            label="Country"
            skeleton={!loaded}
            skeletonWidth="md"
            skeletonIndex={4}
            required={REQUIRED_FIELDS.has("country")}
            value={formData.country}
            onChange={(e) => handleInputChange("country", e.target.value)}
            options={COUNTRY_OPTIONS}
            placeholder="Select country"
          />
          <SettingsInput
            id="state"
            label="State / Region"
            type="text"
            skeleton={!loaded}
            skeletonWidth="sm"
            skeletonIndex={5}
            required={REQUIRED_FIELDS.has("state")}
            value={formData.state}
            onChange={(e) => handleInputChange("state", e.target.value)}
            placeholder="e.g. California"
          />
        </div>
        <SettingsSelect
          id="role"
          label="Role"
          skeleton={!loaded}
          skeletonWidth="md"
          skeletonIndex={6}
          required={REQUIRED_FIELDS.has("role")}
          value={formData.role}
          onChange={(e) => handleInputChange("role", e.target.value)}
          options={ROLE_OPTIONS}
          placeholder="Select your role"
          hint="Personal stats for players, overviews for coaches."
        />
      </SettingsSection>

      {/* Save — left-aligned compact, matching the Account page convention.
          The ⌘S hint only appears when there's something to save. */}
      {!(profileCompleted && isComplete && !hasChanges) && (
        <div className="pt-2 flex flex-col items-start gap-2">
          <SettingsButton
            onClick={handleSave}
            disabled={!hasChanges}
            loading={loading}
            variant="blue"
          >
            Save changes
          </SettingsButton>
          {hasChanges && (
            <p className="text-[10px] text-[var(--color-ink-400)] tracking-[0.3px]">
              You have unsaved changes · or press{" "}
              <kbd className="text-[var(--color-ink-700)] font-medium">
                {isMac ? "⌘S" : "Ctrl+S"}
              </kbd>
            </p>
          )}
        </div>
      )}

      {/* Completion CTA — scoreboard voice. Final score reads like a match
          result, not a SaaS toast. The peak moment of the settings flow. */}
      {profileCompleted && isComplete && !hasChanges && (
        <motion.div
          ref={completionRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_CURVE }}
          className="flex items-end justify-between gap-6 pt-6 border-t border-[var(--color-success-tint-20)]"
        >
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15, ease: EASE_CURVE }}
              className="text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--color-success)]"
            >
              Final · Match-day ready
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25, ease: EASE_CURVE }}
              className="font-light text-[22px] text-[var(--color-ink-900)] tracking-[-0.4px] leading-[1.15]"
            >
              Profile complete.
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.4, ease: EASE_CURVE }}
              className="text-[11px] text-[var(--color-ink-500)] leading-[1.55]"
            >
              Your dashboard is calibrated.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3, ease: EASE_CURVE }}
            className="flex flex-col items-end gap-2"
          >
            <p className="font-light text-[22px] text-[var(--color-success)] tracking-[-0.4px] tabular-nums leading-none whitespace-nowrap">
              {String(completedCount).padStart(2, "0")}
              <span className="text-[var(--color-ink-300)]">
                {" "}/ {String(PROFILE_FIELDS.length).padStart(2, "0")}
              </span>
            </p>
            <Link
              href="/dashboard"
              className={cn(
                "inline-flex items-center gap-2 h-9 px-4 text-[10px] font-medium uppercase tracking-[1.5px] rounded-full whitespace-nowrap",
                "bg-[var(--color-ink-900)] text-white hover:bg-[var(--color-ink-700)] transition-colors duration-200",
                FOCUS_RING
              )}
            >
              Open dashboard
              <ArrowRight className="size-3" strokeWidth={1.75} />
            </Link>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
