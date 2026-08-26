export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("Content-Type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return json(
        {
          error: "Please send JSON with an imageUrl and code."
        },
        400
      );
    }

    const body = await request.json();

    const code = String(body.code || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();

    if (!code) {
      return json(
        {
          error: "Short link code is required."
        },
        400
      );
    }

    if (!imageUrl) {
      return json(
        {
          error: "Image URL is required."
        },
        400
      );
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return json(
        {
          error: "Please provide a valid image URL."
        },
        400
      );
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return json(
        {
          error: "Image URL must use HTTP or HTTPS."
        },
        400
      );
    }

    const link = await env.DB.prepare(
      `
        SELECT id, code
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(code)
      .first();

    if (!link) {
      return json(
        {
          error: "Short link not found."
        },
        404
      );
    }

    const now = new Date().toISOString();

    await env.DB.prepare(
      `
        UPDATE links
        SET
          og_image = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
      .bind(imageUrl, now, link.id)
      .run();

    return json({
      success: true,
      message: "OG image URL saved successfully.",
      imageUrl
    });
  } catch (error) {
    console.error("POST /api/upload error:", error);

    return json(
      {
        error: "Unable to save image URL."
      },
      500
    );
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}
