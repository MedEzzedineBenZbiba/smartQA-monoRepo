import { jwtDecode } from "jwt-decode";
import { decrypt } from "./encryptSession";
import { Employee } from "@/types/employee.type";
import axios from "axios";

export function getOneLetterFromUserName(sessionData: SessionData) {
  const decoded = jwtDecode(sessionData.access_token) as any;
  return decoded.preferred_username.slice(0, 1);
}

export function getUserName(sessionData: SessionData) {
  const decoded = jwtDecode(sessionData.access_token) as any;
  return decoded.preferred_username;
}

export function getUserRole(sessionData: SessionData) {
  return sessionData.role[0];
}
