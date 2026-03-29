const clients = new Set<ReadableStreamDefaultController>();

export function getClients() {
  return clients;
}

export function broadcastEvent(event: { type: string; data: unknown }) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(message);
  clients.forEach((controller) => {
    try {
      controller.enqueue(encoded);
    } catch {
      clients.delete(controller);
    }
  });
}
