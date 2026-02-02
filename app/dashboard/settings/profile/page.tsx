"use client";

import { useState } from "react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";

export default function ProfilePage() {
  const [formData, setFormData] = useState({
    firstName: "Clajerson",
    lastName: "Gimena",
    birthdate: "1995-06-15",
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
