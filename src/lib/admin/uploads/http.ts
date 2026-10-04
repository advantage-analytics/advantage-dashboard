import { NextResponse } from "next/server";

/**
 * The admin upload routes' one answer: a success is `200 { ok, ... }`; a
 * refusal answers its own status (401 no session, 403 not an admin, 400 a bad
 * request) and the body stays `{ ok, message }`, all the wizard reads.
 */
export function adminJson(
  result:
    { ok: true } | { ok: false; status: 400 | 401 | 403; message: string },
) {
  if (result.ok) return NextResponse.json(result);
  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}
