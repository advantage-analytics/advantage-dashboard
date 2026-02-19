"use client";

import { useState } from "react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";

export default function AccountPage() {
  const [email] = useState("clajerson@example.com");
  const [phone, setPhone] = useState("+1 555 123 4567");
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    setHasChanges(true);
    setMessage(null);
  };

  const handleSave = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setMessage({ type: "success", text: "Account updated successfully" });
    setHasChanges(false);
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    setResetLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setMessage({ type: "success", text: "Password reset email sent to your inbox" });
    setResetLoading(false);
  };

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div>
        <h2 className="text-sm font-medium text-[#0D0D0D]">Account</h2>
        <p className="text-xs text-[#999] mt-1">
          Manage your account credentials and security
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
        <SettingsSection title="Account Information">
          <SettingsInput
            id="email"
            label="Email"
            type="email"
            value={email}
            disabled
            hint="Contact support to change your email address"
          />
          <SettingsInput
            id="phone"
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+1 555 000 0000"
          />
        </SettingsSection>

        <SettingsSection title="Security">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-[#0D0D0D]">Password</p>
              <p className="text-xs text-[#999] mt-1">
                We&apos;ll send a secure link to reset your password
              </p>
            </div>
            <SettingsButton
              variant="outline"
              onClick={handlePasswordReset}
              loading={resetLoading}
            >
              Reset password
            </SettingsButton>
          </div>
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
