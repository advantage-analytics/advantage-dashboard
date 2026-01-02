"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [school, setSchool] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const { error: submitError } = await supabase
        .from("contact_submissions")
        .insert([{ name, email, phone, role, school, message }]);

      if (submitError) throw submitError;

      setSuccess(true);
      setName("");
      setEmail("");
      setPhone("");
      setRole("");
      setSchool("");
      setMessage("");
    } catch (err) {
      console.error("Contact submission error:", err);
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white pt-32 md:pt-40 pb-20 px-6 md:px-20">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 md:gap-12 lg:gap-16 items-center">
          {/* Left side - Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8 lg:col-span-2"
          >
            <div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium text-[#1D1D1F] mb-6">
                Let's Talk
              </h1>
              <p className="text-base md:text-lg text-gray-400 max-w-md">
                Contact us to inform you about our services, or if you have
                questions about our company.
              </p>
            </div>

            <div className="pt-8 border-t border-gray-300">
              <div className="flex items-center gap-3 text-gray-400">
                <Mail className="w-5 h-5" />
                <a
                  href="mailto:team@advantage-analytics.com"
                  className="text-base hover:text-[#659BFF] transition-colors"
                >
                  team@advantage-analytics.com
                </a>
              </div>
            </div>
          </motion.div>

          {/* Right side - Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="lg:col-span-3"
          >
            {/* Blue gradient border wrapper */}
            <div className="bg-gradient-to-br from-[#659BFF] via-[#8BB5FF] to-[#B5D0FF] rounded-[32px] p-4">
              {/* Form content */}
              <div className="bg-white rounded-[24px] p-8 md:p-10">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Name and Role row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-sm text-gray-700">
                        Full Name
                      </Label>
                      <Input
                        id="name"
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="bg-[#F5F5F7] border-0 h-12 rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-sm text-gray-700">
                        Role
                      </Label>
                      <Select value={role} onValueChange={setRole}>
                        <SelectTrigger className="bg-[#F5F5F7] border-0 h-12 rounded-lg">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="player">Player</SelectItem>
                          <SelectItem value="coach">Coach</SelectItem>
                          <SelectItem value="parent">Parent</SelectItem>
                          <SelectItem value="administrator">
                            Administrator
                          </SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Email and Phone row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm text-gray-700">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-[#F5F5F7] border-0 h-12 rounded-lg autofill:shadow-[inset_0_0_0px_1000px_rgb(245,245,247)] autofill:text-foreground"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm text-gray-700">
                        Phone (optional)
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+123456789"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="bg-[#F5F5F7] border-0 h-12 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* School */}
                  <div className="space-y-2">
                    <Label htmlFor="school" className="text-sm text-gray-700">
                      School
                    </Label>
                    <Input
                      id="school"
                      type="text"
                      placeholder="University"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      className="bg-[#F5F5F7] border-0 h-12 rounded-lg"
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-sm text-gray-700">
                      Message
                    </Label>
                    <Textarea
                      id="message"
                      placeholder="Enter your message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      rows={5}
                      className="bg-[#F5F5F7] border-0 rounded-lg resize-none"
                    />
                  </div>

                  {/* Submit button */}
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <Button
                      type="submit"
                      disabled={loading || success}
                      className="bg-[#1D1D1F] hover:bg-[#1D1D1F]/90 text-white px-12 py-6 rounded-full text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? "Sending..." : success ? "Sent!" : "Submit"}
                    </Button>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
