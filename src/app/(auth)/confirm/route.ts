import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // Newer Supabase callback flow provides a `code` param to exchange for a session
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // After email confirmation, check if user exists in users table and create if needed
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .single();

          // If profile doesn't exist (first-time email signup), create it
          if (profileError && profileError.code === 'PGRST116') {
            const { error: insertError } = await supabase.from("users").insert([
              {
                id: user.id,
                email: user.email,
                phone: null,
                dob: null,
                state: null,
                country: null,
                role: null,
              },
            ]);

            if (insertError) {
              console.error("Error creating user profile:", insertError.message);
            } else {
              console.log("Created new user profile for email signup");
            }
          }
        }
      } catch (error) {
        console.error("Error in email confirmation:", error);
      }

      redirect(next || `/dashboard`);
    } else {
      redirect(`/error?error=${error?.message}`);
    }
  }

  // Backwards compatibility: handle older email verification links with token_hash/type
  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      // After email confirmation, check if user exists in users table and create if needed
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .single();

          // If profile doesn't exist (first-time email signup), create it
          if (profileError && profileError.code === 'PGRST116') {
            const { error: insertError } = await supabase.from("users").insert([
              {
                id: user.id,
                email: user.email,
                phone: null,
                dob: null,
                state: null,
                country: null,
                role: null,
              },
            ]);

            if (insertError) {
              console.error("Error creating user profile:", insertError.message);
            } else {
              console.log("Created new user profile for email signup (token_hash)");
            }
          }
        }
      } catch (error) {
        console.error("Error in email confirmation (token_hash):", error);
      }

      // redirect user to specified redirect URL or root of app
      redirect(next || `/dashboard`);
    } else {
      // redirect the user to an error page with some instructions
      redirect(`/error?error=${error?.message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/error?error=No token hash or type`);
}
