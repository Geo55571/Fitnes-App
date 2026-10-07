/**
 * /api/sync — hands the request to the FORM sync server (the `form-sync` Worker in server/),
 * bound to this Pages project as the SYNC service. Same origin for the website: no CORS, and
 * the server's own address stays out of the app.
 */
interface Env {
  SYNC?: { fetch: (req: Request) => Promise<Response> };
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.SYNC) {
    return new Response(JSON.stringify({ ok: false, error: 'Accounts aren’t set up on this site yet.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }
  return env.SYNC.fetch(request);
};
