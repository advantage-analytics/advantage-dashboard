"use client";

import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { cn } from "@/lib/utils";

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
    // Reset input so the same file can be selected again
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-5">
      {/* Avatar */}
      <div className="relative group">
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center overflow-hidden",
            "bg-[#F2F2F2] border-2 border-[#E5E5E5]",
            "transition-all duration-200"
          )}
        >
          {src ? (
            <img
              src={src}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-semibold text-[#999]">{initials}</span>
          )}
        </div>

        {/* Hover overlay */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "absolute inset-0 rounded-full flex items-center justify-center",
            "bg-black/50 opacity-0 group-hover:opacity-100",
            "transition-opacity duration-200 cursor-pointer"
          )}
        >
          <Camera className="w-5 h-5 text-white" />
        </button>

        {/* Remove button */}
        {src && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              "absolute -top-1 -right-1 w-6 h-6 rounded-full",
              "bg-white border border-[#E5E5E5] shadow-sm",
              "flex items-center justify-center",
              "opacity-0 group-hover:opacity-100",
              "hover:bg-[#F5F5F5] transition-all duration-200"
            )}
          >
            <X className="w-3 h-3 text-[#666]" />
          </button>
        )}
      </div>

      {/* Upload controls */}
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "px-4 py-2 text-xs font-medium rounded-lg",
            "border border-[#E5E5E5] text-[#0D0D0D]",
            "hover:border-[#3986F3] hover:text-[#3986F3]",
            "transition-colors duration-200"
          )}
        >
          Upload photo
        </button>
        <p className="text-[10px] text-[#999]">JPG, PNG or GIF. Max 2MB.</p>
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

  const initials = `${formData.firstName[0] || ""}${formData.lastName[0] || ""}`.toUpperCase();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setMessage(null);
  };

  const handleImageSelect = (file: File) => {
    // Check file size (2MB limit)
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
    <div className="space-y-8">
      {/* Section Header */}
      <div>
        <h2 className="text-sm font-medium text-[#0D0D0D]">Profile</h2>
        <p className="text-xs text-[#999] mt-1">
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

      {/* Form */}
      <div className="space-y-8">
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

        {/* Save Button */}
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
