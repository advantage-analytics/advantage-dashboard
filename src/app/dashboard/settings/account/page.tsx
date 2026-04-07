"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SettingsInput } from "@/components/dashboard/settings/settings-input";
import { SettingsSection } from "@/components/dashboard/settings/settings-section";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { deleteAccount } from "@/components/dashboard/settings/actions";

export default function AccountPage() {
  const [email] = useState("clajerson@example.com");
  const [phone, setPhone] = useState("+1 555 123 4567");
  const [hasChanges, setHasChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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
    setMessage({
      type: "success",
      text: "Password reset email sent to your inbox",
    });
    setResetLoading(false);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await deleteAccount();
    } catch {
      setMessage({
        type: "error",
        text: "Failed to delete account. Please contact support.",
      });
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="max-w-xl space-y-8">
      {/* Page Heading */}
      <div>
        <h2 className="text-[14px] font-medium text-[#0D0D0D]">Account</h2>
        <p className="text-[11px] text-[#888888] mt-0.5">
          Manage your credentials and security
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

      {/* Account Information */}
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

      {/* Security */}
      <SettingsSection title="Security">
        <div className="space-y-3">
          <div>
            <p className="text-[12px] font-medium text-[#0D0D0D]">Password</p>
            <p className="text-[11px] text-[#AAAAAA] mt-1">
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

      {/* Danger Zone */}
      <SettingsSection title="Danger Zone">
        <div className="rounded-[14px] border border-[#E51837]/10 bg-[rgba(229,24,55,0.02)] p-5">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-[rgba(229,24,55,0.08)] flex items-center justify-center flex-shrink-0">
              <AlertTriangle
                className="size-3.5 text-[#E51837]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#0D0D0D]">
                Delete account
              </p>
              <p className="text-[11px] text-[#888888] mt-0.5 leading-relaxed">
                Permanently remove your account and all associated data. This
                action cannot be undone.
              </p>

              {!showDeleteConfirm ? (
                <div className="mt-3">
                  <SettingsButton
                    variant="danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete account
                  </SettingsButton>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-[11px] font-medium text-[#E51837]">
                    Are you sure? All your match data, statistics, and reports
                    will be permanently deleted.
                  </p>
                  <div className="flex items-center gap-2">
                    <SettingsButton
                      variant="danger"
                      onClick={handleDeleteAccount}
                      loading={deleteLoading}
                      className="bg-[#E51837] text-white border-transparent hover:bg-[#C41530] hover:text-white"
                    >
                      Yes, delete my account
                    </SettingsButton>
                    <SettingsButton
                      variant="secondary"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </SettingsButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
