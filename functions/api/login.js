export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return new Response(
        JSON.stringify({
          error: "Username and password are required."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * Admin credentials:
     *
     * Set these as Cloudflare Pages environment variables:
     *
     * ADMIN_USERNAME
     * ADMIN_PASSWORD
     *
     * Do NOT put your real password directly in this file.
     */

    const adminUsername =
      env.ADMIN_USERNAME || "admin";

    const adminPassword =
      env.ADMIN_PASSWORD || "change-this-password";

    if (
      username !== adminUsername ||
      password !== adminPassword
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid username or password."
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * Create a simple random session token.
     * The token is stored in the browser cookie.
     */
    const randomBytes = new Uint8Array(32);

    crypto.getRandomValues(randomBytes);

    const session = Array.from(randomBytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login successful."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",

          /*
           * HttpOnly prevents JavaScript from reading
           * the session cookie.
           *
           * Secure works on HTTPS, which Cloudflare Pages uses.
           *
           * SameSite=Lax helps protect against CSRF.
           */
          "Set-Cookie":
            `session=${encodeURIComponent(session)}; ` +
            `Path=/; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Max-Age=604800`
        }
      }
    );

  } catch (error) {
    console.error("Login error:", error);

    return new Response(
      JSON.stringify({
        error: "Invalid request."
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
