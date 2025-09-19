"use client";

import { useState } from "react";
import { deleteAccount } from "@/components/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteAccount() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteAccount();
      // The server action will handle the redirect
    } catch (error: unknown) {
      console.error("Delete account error:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-xl text-red-600">Delete Account</CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}
        
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="destructive" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Deleting..." : "Delete Account"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your
                account and remove all your data from our servers. You will lose
                access to all your information, including your profile, settings,
                and any other data associated with your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="bg-red-600 hover:bg-red-700"
                disabled={isLoading}
              >
                {isLoading ? "Deleting..." : "Yes, delete my account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
