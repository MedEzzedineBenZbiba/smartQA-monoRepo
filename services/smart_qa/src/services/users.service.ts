import { employee, DashboardStats, Employee } from "@/types/employee.type";
import axios from "axios";
import https from "https";
import { jwtDecode } from "jwt-decode";

export type PaginatedUsers = {
  data: employee[];
  total: number;
  totalPages: number;
};

const agent = new https.Agent({ rejectUnauthorized: false });
const BASE_URL = "http://localhost:8004";

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  httpsAgent: agent,
  headers: { "Content-Type": "application/json" },
});

export async function getUsers(
  page = 1,
  limit = 1,
  search = "",
  roles: string[] = [],
): Promise<PaginatedUsers | undefined> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
    });

    roles.forEach((role) => params.append("roles", role));

    const response = await axios.get<PaginatedUsers>(
      `${BASE_URL}/users?${params.toString()}`,
      {
        httpsAgent: agent,
        headers: { "Content-Type": "application/json" },
      },
    );
    return response.data;
  } catch (error: any) {
    console.error("Error fetching users:", error.message);
    return undefined;
  }
}

export async function getDashboardStats(): Promise<DashboardStats | undefined> {
  try {
    const response = await axiosInstance.get<DashboardStats>(
      "/users/stats/dashboard",
    );
    return response.data;
  } catch (error: any) {
    console.error("Error fetching dashboard stats:", error.message);
    return undefined;
  }
}

export async function getGenderStats(): Promise<
  DashboardStats["byGender"] | undefined
> {
  try {
    const response = await axiosInstance.get<DashboardStats["byGender"]>(
      "/users/stats/gender",
    );
    return response.data;
  } catch (error: any) {
    console.error("Error fetching gender stats:", error.message);
    return undefined;
  }
}

export async function getRecentHires(): Promise<employee[] | undefined> {
  try {
    const response = await axiosInstance.get<employee[]>(
      "/users/stats/recent-hires",
    );
    return response.data;
  } catch (error: any) {
    console.error("Error fetching recent hires:", error.message);
    return undefined;
  }
}

export async function getAuthentificatedUser(
  sessionData: SessionData,
): Promise<Employee | null> {
  const decoded = jwtDecode<any>(sessionData.access_token);
  const id = decoded.sub;

  try {
    const response = await axios.get<Employee>(
      `http://localhost:8004/users/${id}`,
    );

    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}
