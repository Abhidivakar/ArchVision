import type { Metadata } from "next";
import "./globals.css";
import { AudioUnlock } from "@/components/AudioUnlock";

export const metadata: Metadata = {
  title: "ArchVision — AI Architecture Analyzer",
  description:
    "Upload your cloud architecture diagram and get instant interactive insights, cost analysis, security scoring and Terraform skeletons.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground min-h-screen">
        <AudioUnlock />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
