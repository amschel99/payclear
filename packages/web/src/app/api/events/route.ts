import { getClients } from "@/lib/sse";

export async function GET() {
  const encoder = new TextEncoder();
  const clients = getClients();
  let heartbeatId: ReturnType<typeof setInterval>;
  let ctrl: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;
      clients.add(controller);

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`
        )
      );

      heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeatId);
          clients.delete(controller);
        }
      }, 30_000);
    },
    cancel() {
      clearInterval(heartbeatId);
      clients.delete(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";
