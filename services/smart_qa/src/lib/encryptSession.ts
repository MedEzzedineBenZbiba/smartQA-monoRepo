// lib/encryptSession.ts
import { EncryptJWT, jwtDecrypt } from "jose";

const keyBytes = Uint8Array.from(
  atob("bOZjHw/QH9UoxgK2Qt9VBKvCrSghhrdRVTlXyb/MOeQ="),
  (c) => c.charCodeAt(0),
);

export async function encrypt(sessionData: SessionData) {
  return await new EncryptJWT(sessionData)
    .setProtectedHeader({ alg: "dir", enc: "A128CBC-HS256" })
    .encrypt(keyBytes);
}

export async function decrypt(data: string | Uint8Array) {
  const { payload } = await jwtDecrypt(data, keyBytes);
  return payload;
}
