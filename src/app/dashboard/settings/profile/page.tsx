"use client";

import { useState, useRef } from "react";
import { Camera, Trash2 } from "lucide-react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { cn } from "@/lib/utils";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40";

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
              "h-8 px-3.5 text-[10px] font-medium uppercase tracking-[1.5px] rounded-full",
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
  const [formData, setFormData] = useState({
    firstName: "Clajerson",
    lastName: "Gimena",
    birthdate: "1995-06-15",
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const initials =
    `${formData.firstName[0] || ""}${formData.lastName[0] || ""}`.toUpperCase();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setMessage(null);
  };

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
    setHasChanges(false);
    setLoading(false);
  };

  return (
    <div className="max-w-xl space-y-8">
      {/* Page Heading */}
      <div>
        <h2 className="text-[14px] font-medium text-[#0D0D0D]">Profile</h2>
        <p className="text-[11px] text-[#888888] mt-0.5">
          Manage your personal information
        </p>
      </div>

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
          value={formData.birthdate}
          onChange={(e) => handleInputChange("birthdate", e.target.value)}
        />
      </SettingsSection>

      {/* Save */}
      <div className="pt-2">
        <SettingsButton
          onClick={handleSave}
          disabled={!hasChanges}
          loading={loading}
          fullWidth
        >
          Save changes
        </SettingsButton>
      </div>
    </div>
  );
}
