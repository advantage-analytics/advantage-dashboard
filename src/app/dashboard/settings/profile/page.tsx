"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Camera, Trash2, ArrowRight } from "lucide-react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSelect } from "@/components/dashboard/settings/settings-select";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { ProfileWelcomeBanner } from "@/components/dashboard/settings/profile-welcome-banner";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40";

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

/** Fields the auth system checks for profile completeness. */
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

function ProfilePicture({
  src,
  initials,
  onImageSelect,
  onRemove,
}: {
  src: string | null;
  initials: string;
  onImageSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onImageSelect(file);
    }
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-6">
      {/* Avatar */}
      <div className="relative group">
        <div
          className={cn(
            "size-[72px] rounded-full flex items-center justify-center overflow-hidden",
            "bg-[#F5F5F5] border border-[#F3F3F3]"
          )}
        >
          {src ? (
            <img
              src={src}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[18px] font-semibold text-[#AAAAAA] select-none">
              {initials}
            </span>
          )}
        </div>

        {/* Hover / focus overlay */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Change profile photo"
          className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center",
            "bg-[#0D0D0D]/40 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            "transition-opacity duration-200 cursor-pointer",
            FOCUS_RING
          )}
        >
          <Camera className="size-4 text-white" strokeWidth={1.5} />
        </button>
      </div>

      {/* Upload controls */}
      <div className="space-y-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "h-8 px-3.5 text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px]",
              "border border-[#EAECF0] text-[#525252]",
              "hover:border-[#3B82F6] hover:text-[#3B82F6]",
              "transition-colors duration-200",
              FOCUS_RING
            )}
          >
            Upload photo
          </button>
          {src && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Remove profile photo"
              className={cn(
                "size-8 rounded-full flex items-center justify-center",
                "border border-[#EAECF0] text-[#AAAAAA]",
                "hover:border-[#E51837]/30 hover:text-[#E51837]",
                "transition-colors duration-200",
                FOCUS_RING
              )}
            >
              <Trash2 className="size-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-[#AAAAAA]">
          JPG, PNG or GIF. Max 2MB.
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // TODO: Replace with Supabase user data once profile fetching is wired up
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    birthdate: "",
    phone: "",
    country: "",
    state: "",
    role: "",
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
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

  const { setHasUnsavedChanges } = useUnsavedChanges();

  // Sync local hasChanges into the unsaved-changes context
  useEffect(() => {
    setHasUnsavedChanges(hasChanges);
    return () => setHasUnsavedChanges(false);
  }, [hasChanges, setHasUnsavedChanges]);

  // Cmd+S / Ctrl+S keyboard shortcut to save
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

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

  const completedCount = PROFILE_FIELDS.filter(
    (f) => formData[f]?.trim().length > 0
  ).length;
  const isComplete = completedCount === PROFILE_FIELDS.length;
  const isNewUser = completedCount === 0 && !bannerDismissed;
  const missingFieldNames = PROFILE_FIELDS.filter(
    (f) => !formData[f]?.trim()
  ).map((f) => FIELD_LABELS[f]);

  const initials =
    `${formData.firstName[0] || ""}${formData.lastName[0] || ""}`.toUpperCase() ||
    "?";

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setMessage(null);
  }, []);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissed(true);
    localStorage.setItem("profile-onboarding-dismissed", "true");
  }, []);

  const handleImageSelect = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be less than 2MB" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setProfileImage(e.target?.result as string);
      setHasChanges(true);
      setMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    setHasChanges(true);
    setMessage(null);
  };

  const handleSave = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    setMessage({ type: "success", text: "Profile updated successfully" });

    // Set completion before clearing hasChanges to avoid render flash
    if (isComplete) {
      setProfileCompleted(true);
    }

    setHasChanges(false);
    setLoading(false);
  };

  return (
    <div className="max-w-xl space-y-8">
      {/* Page Heading — context-aware for new users */}
      <div>
        <h2 className="text-[14px] font-medium text-[#0D0D0D]">
          {isNewUser ? "Set up your profile" : "Profile"}
        </h2>
        <p className="text-[11px] text-[#888888] mt-0.5">
          {isNewUser
            ? "Tell us a bit about yourself so we can personalize your experience"
            : "Manage your personal information"}
        </p>
        {!isComplete && (
          <p className="text-[10px] text-[#AAAAAA] mt-2">
            <span className="text-[#3B82F6]">*</span> Required to complete your profile
          </p>
        )}
      </div>

      {/* Onboarding Banner */}
      {!isComplete && !bannerDismissed && (
        <ProfileWelcomeBanner
          completedCount={completedCount}
          totalCount={PROFILE_FIELDS.length}
          missingFieldNames={missingFieldNames}
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

      {/* Profile Picture */}
      <SettingsSection title="Profile Picture">
        <ProfilePicture
          src={profileImage}
          initials={initials}
          onImageSelect={handleImageSelect}
          onRemove={handleRemoveImage}
        />
      </SettingsSection>

      {/* General Information */}
      <SettingsSection title="General Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SettingsInput
            id="firstName"
            label="First Name"
            type="text"
            value={formData.firstName}
            onChange={(e) => handleInputChange("firstName", e.target.value)}
            placeholder="First name"
          />
          <SettingsInput
            id="lastName"
            label="Last Name"
            type="text"
            value={formData.lastName}
            onChange={(e) => handleInputChange("lastName", e.target.value)}
            placeholder="Last name"
          />
        </div>
        <SettingsInput
          id="birthdate"
          label="Date of Birth"
          type="date"
          required={REQUIRED_FIELDS.has("birthdate")}
          value={formData.birthdate}
          onChange={(e) => handleInputChange("birthdate", e.target.value)}
          hint="Used to categorize your age group in rankings"
        />
        <SettingsInput
          id="phone"
          label="Phone Number"
          type="tel"
          inputMode="tel"
          required={REQUIRED_FIELDS.has("phone")}
          value={formData.phone}
          onChange={(e) => handleInputChange("phone", e.target.value)}
          placeholder="+1 555 000 0000"
          hint="For account recovery and match notifications"
        />
      </SettingsSection>

      {/* Tennis Profile */}
      <SettingsSection title="Tennis Profile">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SettingsSelect
            id="country"
            label="Country"
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
            required={REQUIRED_FIELDS.has("state")}
            value={formData.state}
            onChange={(e) => handleInputChange("state", e.target.value)}
            placeholder="e.g. California"
          />
        </div>
        <SettingsSelect
          id="role"
          label="Role"
          required={REQUIRED_FIELDS.has("role")}
          value={formData.role}
          onChange={(e) => handleInputChange("role", e.target.value)}
          options={ROLE_OPTIONS}
          placeholder="Select your role"
          hint="Tailors your dashboard — players see personal stats, coaches see team overviews"
        />
      </SettingsSection>

      {/* Save */}
      <div className="pt-2 space-y-2">
        <SettingsButton
          onClick={handleSave}
          disabled={!hasChanges}
          loading={loading}
          fullWidth
        >
          Save changes
        </SettingsButton>
        <p className="text-[10px] text-[#AAAAAA] text-center tracking-[0.3px]">
          or press{" "}
          <kbd className="text-[#525252] font-medium">
            {typeof navigator !== "undefined" &&
            /mac/i.test(
              (navigator as Navigator & { userAgentData?: { platform: string } })
                .userAgentData?.platform ?? navigator.platform
            )
              ? "\u2318S"
              : "Ctrl+S"}
          </kbd>
        </p>
      </div>

      {/* Completion CTA — persists after save, independent of alert auto-dismiss */}
      {profileCompleted && isComplete && !hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_CURVE }}
          className="rounded-[14px] border border-[rgba(93,185,85,0.15)] bg-[rgba(93,185,85,0.04)] p-5"
        >
          <p className="text-[12px] font-medium text-[#0D0D0D]">
            Profile complete
          </p>
          <p className="text-[11px] text-[#888888] mt-0.5 leading-relaxed">
            You&apos;re all set. Your dashboard is ready.
          </p>
          <div className="mt-3">
            <Link
              href="/dashboard"
              className={cn(
                "inline-flex items-center gap-2 h-9 px-4 text-[10px] font-medium uppercase tracking-[1.5px] rounded-[6px]",
                "bg-[#5DB955] text-white hover:bg-[#4EA84A] transition-colors duration-200",
                FOCUS_RING
              )}
            >
              Go to dashboard
              <ArrowRight className="size-3" strokeWidth={1.5} />
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
