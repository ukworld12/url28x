export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        code,
        url,
        title,
        clicks,
        active,
        created_at,
        updated_at
      FROM links
      ORDER BY id DESC
    `).all();

    return json({
      success: true,
      links: result.results || []
    });
  } catch (error) {
    console.error("GET /api/links error:", error);

    return json(
      {
        error: "Unable to load links."
      },
      500
    );
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const url = String(body.url || "").trim();
    const title = String(body.title || "").trim();
    let code = String(body.code || "").trim();

    if (!url) {
      return json(
        {
          error: "URL is required."
        },
        400
      );
    }

    try {
      const parsed = new URL(url);

      if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
      ) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return json(
        {
          error: "Please enter a valid HTTP or HTTPS URL."
        },
        400
      );
    }

    if (code) {
      if (!/^[a-zA-Z0-9_-]{2,64}$/.test(code)) {
        return json(
          {
            error:
              "Custom code can contain only letters, numbers, hyphens and underscores."
          },
          400
        );
      }
    } else {
      code = generateCode(7);
    }

    const existing = await env.DB.prepare(
      `
        SELECT id
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(code)
      .first();

    if (existing) {
      if (!body.code) {
        let attempts = 0;

        while (attempts < 10) {
          code = generateCode(7);

          const found = await env.DB.prepare(
            `
              SELECT id
              FROM links
              WHERE code = ?
              LIMIT 1
            `
          )
            .bind(code)
            .first();

          if (!found) break;

          attempts++;
        }

        if (attempts >= 10) {
          return json(
            {
              error:
                "Could not generate a unique short code. Please try again."
            },
            500
          );
        }
      } else {
        return json(
          {
            error: "That short code is already in use."
          },
          409
        );
      }
    }

    const now = new Date().toISOString();

    await env.DB.prepare(
      `
        INSERT INTO links
          (code, url, title, clicks, active, created_at, updated_at)
        VALUES
          (?, ?, ?, 0, 1, ?, ?)
      `
    )
      .bind(
        code,
        url,
        title || null,
        now,
        now
      )
      .run();

    const link = await env.DB.prepare(
      `
        SELECT
          id,
          code,
          url,
          title,
          clicks,
          active,
          created_at,
          updated_at
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(code)
      .first();

    return json(
      {
        success: true,
        message: "Short link created successfully.",
        link
      },
      201
    );
  } catch (error) {
    console.error("POST /api/links error:", error);

    return json(
      {
        error: "Unable to create short link."
      },
      500
    );
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const requestUrl = new URL(request.url);
    const oldCode =
      requestUrl.searchParams.get("code")?.trim();

    if (!oldCode) {
      return json(
        {
          error: "Short code is required."
        },
        400
      );
    }

    const body = await request.json();

    const url = String(body.url || "").trim();
    const title = String(body.title || "").trim();

    if (!url) {
      return json(
        {
          error: "URL is required."
        },
        400
      );
    }

    try {
      const parsed = new URL(url);

      if (
        parsed.protocol !== "http:" &&
        parsed.protocol !== "https:"
      ) {
        throw new Error("Invalid protocol");
      }
    } catch {
      return json(
        {
          error: "Please enter a valid HTTP or HTTPS URL."
        },
        400
      );
    }

    const existing = await env.DB.prepare(
      `
        SELECT id
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(oldCode)
      .first();

    if (!existing) {
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
          url = ?,
          title = ?,
          updated_at = ?
        WHERE code = ?
      `
    )
      .bind(
        url,
        title || null,
        now,
        oldCode
      )
      .run();

    const link = await env.DB.prepare(
      `
        SELECT
          id,
          code,
          url,
          title,
          clicks,
          active,
          created_at,
          updated_at
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(oldCode)
      .first();

    return json({
      success: true,
      message: "Short link updated successfully.",
      link
    });
  } catch (error) {
    console.error("PUT /api/links error:", error);

    return json(
      {
        error: "Unable to update short link."
      },
      500
    );
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const requestUrl = new URL(request.url);
    const code =
      requestUrl.searchParams.get("code")?.trim();

    if (!code) {
      return json(
        {
          error: "Short code is required."
        },
        400
      );
    }

    const existing = await env.DB.prepare(
      `
        SELECT id
        FROM links
        WHERE code = ?
        LIMIT 1
      `
    )
      .bind(code)
      .first();

    if (!existing) {
      return json(
        {
          error: "Short link not found."
        },
        404
      );
    }

    /*
     * Delete analytics first so this also works
     * if the database does not have foreign-key
     * cascading enabled.
     */
    await env.DB.prepare(
      `
        DELETE FROM analytics
        WHERE link_id = ?
      `
    )
      .bind(existing.id)
      .run();

    await env.DB.prepare(
      `
        DELETE FROM links
        WHERE id = ?
      `
    )
      .bind(existing.id)
      .run();

    return json({
      success: true,
      message: "Short link deleted successfully."
    });
  } catch (error) {
    console.error("DELETE /api/links error:", error);

    return json(
      {
        error: "Unable to delete short link."
      },
      500
    );
  }
}

function generateCode(length = 7) {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  const bytes = new Uint8Array(length);

  crypto.getRandomValues(bytes);

  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters[
      bytes[i] % characters.length
    ];
  }

  return result;
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
