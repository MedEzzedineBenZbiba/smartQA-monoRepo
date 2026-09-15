import { getAccessTokenClient } from "@/lib/getAccessToken.client";
import { DashboardStats, Employee } from "@/types/employee.type";
import { SessionData } from "@/types/sessionData.type";
import axios from "axios";
import https from "https";
import { jwtDecode, JwtPayload } from "jwt-decode";

export type PaginatedUsers = {
  data: Employee[];
  total: number;
  totalPages: number;
};

const agent = new https.Agent({ rejectUnauthorized: false });
// const BASE_URL = "http://localhost:8004";
const BASE_URL = "https://localhost";

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

    const token = await getAccessTokenClient();
    const response = await axios.get<PaginatedUsers>(
      `${BASE_URL}/users?${params.toString()}`,
      {
        httpsAgent: agent,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching users:", message);
    return undefined;
  }
}

export async function getDashboardStats(): Promise<DashboardStats | undefined> {
  try {
    const token = await getAccessTokenClient();

    const response = await axiosInstance.get<DashboardStats>(
      "/users/stats/dashboard",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching dashboard stats:", message);
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching gender stats:", message);
    return undefined;
  }
}

export async function getRecentHires(): Promise<Employee[] | undefined> {
  try {
    const token = await getAccessTokenClient();
    const response = await axiosInstance.get<Employee[]>(
      "/users/stats/recent-hires",
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching recent hires:", message);
    return undefined;
  }
}

export async function getAuthentificatedUser(
  sessionData: SessionData,
): Promise<Employee | null> {
  const decoded = jwtDecode<JwtPayload>(sessionData.access_token);
  const id = decoded.sub;

  try {
    // const response = await axios.get<Employee>(
    //   `http://localhost:8004/users/${id}`,
    // );

    const response = await axios.get<Employee>(
      `https://localhost/users/${id}`,
      {
        httpsAgent: agent,
        headers: {
          Authorization: `Bearer ${sessionData.access_token}`,
        },
      },
    );

    return response.data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching data:", message);
    return null;
  }
}
