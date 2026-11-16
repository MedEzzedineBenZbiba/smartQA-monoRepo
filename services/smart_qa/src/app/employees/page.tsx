import type { Metadata } from "next";
import EmployeesList from "./EmployeesList";

export const metadata: Metadata = {
  title: "Employees",
};

export default function EmployeesPage() {
  return <EmployeesList />;
}
