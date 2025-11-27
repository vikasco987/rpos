import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Next.js may wrap params in a Promise
    const { id: restoreId } = await params;

    // 1️⃣ Fetch deleted bill snapshot
    const entry = await prisma.deleteHistory.findUnique({
      where: { id: restoreId },
    });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const snap: any = entry.snapshot;

    // 2️⃣ Restore BILL (removed resumedBy & resumedAt)
    const restoredBill = await prisma.bill.create({
      data: {
        id: snap.id,
        userId: snap.userId,
        clerkUserId: snap.clerkUserId ?? null,
        customerId: snap.customerId ?? null,

        total: snap.total ?? 0,
        discount: snap.discount ?? null,
        gst: snap.gst ?? null,
        grandTotal: snap.grandTotal ?? null,
        paymentStatus: snap.paymentStatus ?? "PENDING",
        paymentMode: snap.paymentMode ?? null,
        notes: snap.notes ?? null,

        holdBy: snap.holdBy ?? null,
        holdAt: snap.holdAt ? new Date(snap.holdAt) : null,

        createdAt: snap.createdAt ? new Date(snap.createdAt) : new Date(),
        updatedAt: new Date(),
      },
    });

    // 3️⃣ Restore BILL PRODUCTS
    if (snap.products && snap.products.length > 0) {
      const productsData = snap.products.map((item: any) => ({
        id: item.id,
        billId: snap.id,
        itemId: item.itemId,
        quantity: item.quantity,
        price: item.price,
        gst: item.gst ?? null,
        discount: item.discount ?? null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
      }));

      // MongoDB: createMany CANNOT use skipDuplicates
      for (const p of productsData) {
        await prisma.billProduct.create({ data: p });
      }
    }

    // 4️⃣ Restore PAYMENTS
    if (snap.payments && snap.payments.length > 0) {
      for (const pay of snap.payments) {
        await prisma.payment.create({
          data: {
            id: pay.id,
            billId: snap.id,
            amount: pay.amount,
            mode: pay.mode,
            createdAt: pay.createdAt ? new Date(pay.createdAt) : new Date(),
          },
        });
      }
    }

    // 5️⃣ Restore HISTORY
    if (snap.history && snap.history.length > 0) {
      for (const h of snap.history) {
        await prisma.billHistory.create({
          data: {
            id: h.id,
            billId: snap.id,
            action: h.action,
            message: h.message,
            createdAt: h.createdAt ? new Date(h.createdAt) : new Date(),
          },
        });
      }
    }

    // 6️⃣ Delete restore entry
    await prisma.deleteHistory.delete({
      where: { id: restoreId },
    });

    return NextResponse.json({
      success: true,
      message: "Bill restored successfully",
      data: restoredBill,
    });
  } catch (error) {
    console.error("RESTORE ERROR:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
