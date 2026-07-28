export type Employee = {
  id: string;
  username: string;
  email: string;
  role: "QA" | "Software engineer" | "Team lead";
  gender: "male" | "female";
  lastIngestionDate: Date | null;
  createdAt: Date;
};

export type DashboardStats = {
  total: number;
  byRole: Record<string, number>;
  byGender: {
    male: number;
    female: number;
  };
};
