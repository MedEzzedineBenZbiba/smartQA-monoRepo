// src/app/dashboard/page.tsx
import Dashboard from "./dashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashbord",
};

export default function Page() {
  return <Dashboard />;
}
