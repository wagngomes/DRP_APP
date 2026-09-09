import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validations/user";

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await auth.api.updateUser({
    headers: await headers(),
    body: parsed.data,
  });

  return NextResponse.json({ success: true });
}
