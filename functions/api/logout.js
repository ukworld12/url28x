export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Logged out successfully."
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie":
          "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      }
    }
  );
}
