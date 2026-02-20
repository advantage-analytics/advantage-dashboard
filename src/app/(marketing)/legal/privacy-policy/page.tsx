"use client";

import { motion } from "framer-motion";

export default function PrivacyPolicyPage() {
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
            Privacy Policy
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
              1. Introduction
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              At Advantage ("we," "us," or "our"), we value your privacy and are
              committed to protecting your personal information. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your
              information when you use our tennis analytics platform and
              services (the "Service").
            </p>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              We are committed to complying with applicable data protection
              laws, including the California Consumer Privacy Act (CCPA) and the
              European General Data Protection Regulation (GDPR), where
              applicable.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              By using the Service, you agree to the collection and use of your
              information as described in this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              2. Information We Collect
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              <strong>Personal Information:</strong> This includes your name,
              email address, username, and any other information you provide
              when creating an account.
            </p>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              <strong>Performance Data:</strong> This includes match statistics,
              scores, and other tennis-related performance data you submit to
              the Service.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              <strong>Usage Data:</strong> We collect information about how you
              interact with the Service, such as IP addresses, device type,
              browser information, pages visited, and timestamps.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc list-inside space-y-2 text-sm md:text-base leading-relaxed ml-4 text-gray-400">
              <li>To provide, operate, and maintain the Service.</li>
              <li>
                To process your account registration and manage your
                subscription plans.
              </li>
              <li>
                To analyze and generate tennis performance reports based on the
                data you submit.
              </li>
              <li>
                To communicate with you, including sending service-related
                announcements, updates, and support messages.
              </li>
              <li>
                To improve and customize the Service and develop new features.
              </li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              4. Data Security
            </h2>
            <p className="text-sm md:text-base leading-relaxed mb-4 text-gray-400">
              We implement appropriate technical and organizational measures to
              protect your personal information against unauthorized access,
              disclosure, alteration, or destruction.
            </p>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              However, no method of transmission over the internet or electronic
              storage is completely secure. While we strive to protect your
              data, we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl md:text-3xl font-medium text-[#1D1D1F] mb-4">
              5. Contact Information
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-gray-400">
              If you have any questions about this Privacy Policy, please
              contact us at:
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
