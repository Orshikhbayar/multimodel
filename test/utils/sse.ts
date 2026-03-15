export function buildSseChunk(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function buildDoneSseChunk() {
  return "data: [DONE]\n\n";
}

export function streamFromStrings(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
