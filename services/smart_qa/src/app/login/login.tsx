"use client";

import Image from "next/image";
import { login } from "../data/login";
import { useActionState } from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
};

type Err = { message?: string } | null;

function FieldError({
  serverError,
  errorId,
}: {
  serverError: Err;
  errorId: string;
}) {
  if (!serverError) return null;

  return (
    <div id={errorId} className="text-[#FF2C2C]" role="alert">
      {serverError.message}
    </div>
  );
}

export default function Login() {
  const [{ ok, error, errors, formData }, formAction, isPending] =
    useActionState(login, {
      ok: false,
      error: "",
      errors: {
        email: null,
      },
      formData: new FormData(),
    });

  return (
    <main className="min-h-screen w-full flex overflow-hidden">
      {/* LEFT SIDE */}
      <section className="w-1/2 flex items-center justify-center px-10 min-w-0">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <Image
              src="/icons/log-in.png"
              alt="log-in logo"
              width={25}
              height={25}
              loading="eager"
            />
            <h2 className="font-semibold text-3xl text-center">
              Login into SmartQA
            </h2>
          </div>

          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label htmlFor="email" className="font-bold text-sm mb-1">
                Your email
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                type="email"
                id="email"
                name="email"
                defaultValue={(formData.get("email") ?? "") as string}
                aria-invalid={errors.email ? "true" : "false"}
                aria-describedby="email-error"
              />
              <FieldError serverError={errors.email} errorId="email-error" />
            </div>

            <div className="flex flex-col">
              <label htmlFor="password" className="font-bold text-sm mb-1">
                Your password
              </label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                type="password"
                id="password"
                name="password"
              />
            </div>

            {!ok && error && (
              <p role="alert" className="text-[#FF2C2C]">
                {error}
              </p>
            )}

            {isPending && <p role="alert">loading ...</p>}

            <button
              type="submit"
              disabled={isPending}
              className="bg-[#1f883d] text-white text-sm font-semibold h-[40px] rounded-md"
            >
              Sign in
            </button>
          </form>
        </div>
      </section>

      {/* RIGHT SIDE */}
      <section className="w-1/2 relative h-screen overflow-hidden">
        <Image
          src="/happy-guy.jpg"
          alt="happy guy"
          fill
          priority
          className="object-cover object-top"
        />
      </section>
    </main>
  );
}
