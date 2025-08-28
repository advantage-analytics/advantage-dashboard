import { useState, FormEvent, ChangeEvent } from "react";
import { supabase } from "./supabase-client";

export const Auth = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (isSignUp) {
      // Sign Up: Insert into users table
      //First check uses supabase.auth, success updates authListener
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) {
        console.error("Error signing up:", signUpError.message);
        return;
      }
      //Second check uses users table to store email and password
      const { data, error: insertError } = await supabase
        .from("users")
        .insert([{ email, password }]);
      if (insertError) {
        setError("Error signing up: " + insertError.message);
        return;
      }
      // Optionally, you can auto-login or show a success message here
    } else {
      // Sign In: Check users table for matching email and password
      //First check uses supabase.auth, success updates authListener
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        console.error("Error signing up:", signInError.message);
        return;
      }
      //Second check uses users table to verify email and password
      const { data, error: selectError } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .eq("password", password)
        .single();
      if (selectError || !data) {
        setError("Invalid email or password.");
        return;
      }
      // Optionally, set session or redirect user here
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "0 auto", padding: "1rem" }}>
      <h2>{isSignUp ? "Sign Up" : "Sign In"}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setEmail(e.target.value)
          }
          style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setPassword(e.target.value)
          }
          style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }}
        />
        <button
          type="submit"
          style={{ padding: "0.5rem 1rem", marginRight: "0.5rem" }}
        >
          {isSignUp ? "Sign Up" : "Sign In"}
        </button>
      </form>
      <button
        onClick={() => {
          setIsSignUp(!isSignUp);
          setError(null);
        }}
        style={{ padding: "0.5rem 1rem" }}
      >
        {isSignUp ? "Switch to Sign In" : "Switch to Sign Up"}
      </button>
      {error && (
        <div style={{ color: "red", marginTop: "1rem" }}>{error}</div>
      )}
    </div>
  );
};