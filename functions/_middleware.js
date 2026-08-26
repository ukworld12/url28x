export async function onRequest(context) {
  const { request, env, next } = context;

  const url = new URL(request.url);

  // Allow public/static files without authentication.
  const publicPaths = [
    "/",
    "/index.html",
    "/login.html",
    "/style.css",
    "/app.js",
    "/favicon.ico"
  ];

  if (
    publicPaths.includes(url.pathname) ||
    url.pathname.startsWith("/assets/")
  ) {
    return next();
  }

  // API login/logout must remain accessible.
  if (
    url.pathname === "/api/login" ||
    url.pathname === "/api/logout"
  ) {
    return next();
  }

  // Short URLs such as /abc123 must remain public.
  if (
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/admin")
  ) {
    return next();
  }

  // API routes require a valid login session.
  if (url.pathname.startsWith("/api/")) {
    const cookieHeader = request.headers.get("Cookie") || "";

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => {
          const index = item.indexOf("=");

          if (index === -1) {
            return [item, ""];
          }

          return [
            item.slice(0, index),
            decodeURIComponent(item.slice(index + 1))
          ];
        })
    );

    const session = cookies.session;

    if (!session) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized. Please log in."
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Make the session available to API functions.
    context.data = {
      ...(context.data || {}),
      session
    };
  }

  return next();
}
