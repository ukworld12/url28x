export async function onRequest({ request }) {
  const url = new URL(request.url);

  /*
   * The admin page itself is protected by the
   * frontend/API authentication system.
   *
   * Redirect /admin to the dashboard HTML page.
   */
  if (url.pathname === "/admin") {
    return Response.redirect(
      new URL("/admin.html", request.url),
      302
    );
  }

  return new Response("Not found.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8"
    }
  });
}
