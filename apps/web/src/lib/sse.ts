/** Poll-and-push server-sent events. Ends when the job finishes or the client disconnects. */
export function sse(signal: AbortSignal, poll: (after?: Date) => Promise<{ finished: boolean; messages: { at: Date; message: string }[] } & Record<string, unknown>>, intervalMs = 1000) {
  const enc = new TextEncoder();
  let after: Date | undefined;
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (event: string, data: unknown) => ctl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        for (let i = 0; i < 3600 && !signal.aborted; i++) {
          const p = await poll(after);
          if (p.messages.length) after = new Date(p.messages[p.messages.length - 1]!.at);
          send('progress', p);
          if (p.finished) { send('done', { status: p.status }); break; }
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      } catch { send('error', { message: 'progress unavailable' }); }
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
