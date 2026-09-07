import { SessionData } from "@/types/sessionData.type";
import { jwtDecode } from "jwt-decode";

interface DecodedToken {
  preferred_username: string;
}

export function getOneLetterFromUserName(sessionData: SessionData) {
  const decoded = jwtDecode<DecodedToken>(sessionData.access_token);
  return decoded.preferred_username.slice(0, 1);
}

export function getUserName(sessionData: SessionData) {
  const decoded = jwtDecode<DecodedToken>(sessionData.access_token);
  return decoded.preferred_username;
}

export function getUserRole(sessionData: SessionData) {
  return sessionData.role[0];
}
