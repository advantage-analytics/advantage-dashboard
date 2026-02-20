"use client";

import { motion } from "framer-motion";

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-dvh bg-white px-6 md:px-10 pt-32 md:pt-36 pb-10 md:pb-16">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-5xl font-medium text-[#1D1D1F] mb-4"
          >
            Terms and Conditions
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-sm md:text-base text-gray-400"
          >
            Version 1.0 | Last Updated: August 13, 2025
          </motion.p>
        </motion.div>

        {/* Content */}
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              By accessing or using Advantage (the "Service"), you agree to be
              legally bound by these Terms and Conditions ("Terms"). If you do
              not agree with any part of these Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              2. Description of Service
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              Advantage is a tennis analytics platform designed to provide
              players with data-driven insights through analytics tools,
              algorithms, and personalized reports. Users can create accounts,
              submit match data, and access reports based on their performance.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              3. User Eligibility
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              You must be at least 18 years old to use Advantage. By using the
              Service, you represent and warrant that you meet this age
              requirement and have the legal capacity to enter into a binding
              agreement. If you are under 18, you may only use the Service with
              the involvement and consent of a parent or guardian.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              4. Account Creation and Security
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              To access certain features of the Service, you must create an
              account by providing accurate and complete information. You are
              responsible for maintaining the confidentiality of your account
              credentials and for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              5. Intellectual Property Rights
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              All intellectual property rights in the Service, including but not
              limited to the analytics tools, algorithms, software, and content,
              are owned exclusively by Advantage or its licensors.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              Reports generated from your data are the property of Advantage;
              however, you are granted a broad, non-exclusive, non-transferable
              license to use, download, and share these reports for your
              personal, non-commercial purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              6. Disclaimers and Limitations of Liability
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              The Service and all content, including analytics and reports, are
              provided "as is" and "as available" without warranties of any
              kind, express or implied.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              To the fullest extent permitted by law, Advantage and its
              affiliates shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising out of or
              related to your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              7. Contact Information
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="text-sm md:text-base leading-relaxed mt-2 text-gray-400">
              Email: team@advantage-analytics.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
