import axios from "axios";
import { getAccessToken } from "@/lib/getAccessToken.client";

export async function apiGet<T = any>(url: string) {
  const access_token = await getAccessToken();

  return axios.get<T>(url, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
}
