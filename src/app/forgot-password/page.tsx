import type { Metadata } from "next";
import { ForgotPassword } from "@/components/sign-in";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}
