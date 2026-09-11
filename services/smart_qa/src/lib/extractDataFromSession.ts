import { SessionData } from "@/types/sessionData.type";
import { jwtDecode } from "jwt-decode";

interface DecodedToken {
  preferred_username: string;
}

function decodeToken(sessionData: SessionData): DecodedToken | null {
  const token = sessionData?.access_token;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  try {
    return jwtDecode<DecodedToken>(token);
  } catch {
    return null;
  }
}

export function getOneLetterFromUserName(sessionData: SessionData) {
  return decodeToken(sessionData)?.preferred_username?.slice(0, 1) ?? "";
}

export function getUserName(sessionData: SessionData) {
  return decodeToken(sessionData)?.preferred_username ?? "";
}

export function getUserRole(sessionData: SessionData) {
  return sessionData?.role?.[0] ?? "";
}
