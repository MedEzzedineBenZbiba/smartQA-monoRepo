"use client";

import { useActionState } from "react";

export function LoginForm({ serverAction }) {
  const [{ ok, error, errors, formData }, formAction, isPending] =
    useActionState(serverAction, {
      ok: false,
      error: "",
      errors: {
        email: null,
      },
      formData: new FormData(),
    });
  return (
    <form
      action={formAction}
      className="flex flex-initial flex-col gap-[16px] "
    >
      <div className="field flex flex-initial flex-col ">
        <label htmlFor="email" className="font-bold text-sm mb-[5px]">
          Your email address
        </label>
        <input
          className="w-sm"
          type="email"
          id="email"
          name="email"
          defaultValue={(formData.get("email") ?? "") as string}
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby="name-error"
        />
        <FieldError serverError={errors.email} errorId="name-error" />
      </div>
      <div className="field flex flex-initial flex-col ">
        <label htmlFor="password" className="font-bold text-sm mb-[5px]">
          Your password
        </label>
        <input type="password" id="password" name="password" />
      </div>
      {!ok && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {isPending && <p role="alert">loading ...</p>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-[#1f883d] text-white text-sm h-[40px]   font-medium px-[12px] py-[5px] rounded-md"
      >
        Sign in
      </button>
    </form>
  );
}

type Err = { message?: string } | null;
function FieldError({
  serverError,
  errorId,
}: {
  serverError: Err;
  errorId: string;
}) {
  if (!serverError) {
    return null;
  }
  return (
    <div id={errorId} role="alert">
      {serverError.message}
    </div>
  );
}
