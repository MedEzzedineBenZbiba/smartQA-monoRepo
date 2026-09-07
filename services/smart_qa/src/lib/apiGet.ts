import axios from "axios";
import { getAccessTokenClient } from "@/lib/getAccessToken.client";

export async function apiGet<T = unknown>(url: string) {
  const access_token = await getAccessTokenClient();

  return axios.get<T>(url, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
}
