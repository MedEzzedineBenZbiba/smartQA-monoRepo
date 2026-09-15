// const REFRESH_URL = "http://localhost:8001/auth/refreshAccessToken";
const REFRESH_URL = "http://localhost/auth/refreshAccessToken";

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
} | null> {
  try {
    const response = await fetch(REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
