import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deletedBills = await prisma.deleteHistory.findMany({
      where: { deletedBy: userId },
      orderBy: { deletedAt: "desc" },  // ✅ FIXED
    });

    return NextResponse.json({ success: true, data: deletedBills });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
