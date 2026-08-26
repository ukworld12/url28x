export async function onRequestGet({ request, env }) {
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

    const link = await env.DB.prepare(
      `
        SELECT
          id,
          code,
          url,
          title,
          clicks,
          created_at
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

    const stats = await env.DB.prepare(
      `
        SELECT
          COUNT(*) AS totalClicks,
          COUNT(DISTINCT visitor_id) AS uniqueVisitors
        FROM analytics
        WHERE link_id = ?
      `
    )
      .bind(link.id)
      .first();

    const lastClick = await env.DB.prepare(
      `
        SELECT created_at
        FROM analytics
        WHERE link_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
      .bind(link.id)
      .first();

    const recent = await env.DB.prepare(
      `
        SELECT
          id,
          country,
          city,
          device,
          browser,
          os,
          referrer,
          created_at
        FROM analytics
        WHERE link_id = ?
        ORDER BY id DESC
        LIMIT 100
      `
    )
      .bind(link.id)
      .all();

    const clicksByDay = await env.DB.prepare(
      `
        SELECT
          substr(created_at, 1, 10) AS day,
          COUNT(*) AS clicks
        FROM analytics
        WHERE link_id = ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY day ASC
        LIMIT 90
      `
    )
      .bind(link.id)
      .all();

    const countries = await env.DB.prepare(
      `
        SELECT
          COALESCE(country, 'Unknown') AS country,
          COUNT(*) AS clicks
        FROM analytics
        WHERE link_id = ?
        GROUP BY country
        ORDER BY clicks DESC
        LIMIT 50
      `
    )
      .bind(link.id)
      .all();

    const devices = await env.DB.prepare(
      `
        SELECT
          COALESCE(device, 'Unknown') AS device,
          COUNT(*) AS clicks
        FROM analytics
        WHERE link_id = ?
        GROUP BY device
        ORDER BY clicks DESC
        LIMIT 20
      `
    )
      .bind(link.id)
      .all();

    const browsers = await env.DB.prepare(
      `
        SELECT
          COALESCE(browser, 'Unknown') AS browser,
          COUNT(*) AS clicks
        FROM analytics
        WHERE link_id = ?
        GROUP BY browser
        ORDER BY clicks DESC
        LIMIT 20
      `
    )
      .bind(link.id)
      .all();

    return json({
      success: true,

      link,

      totalClicks:
        Number(stats?.totalClicks || 0),

      uniqueVisitors:
        Number(stats?.uniqueVisitors || 0),

      lastClick:
        lastClick?.created_at || null,

      analytics:
        recent?.results || [],

      clicksByDay:
        clicksByDay?.results || [],

      countries:
        countries?.results || [],

      devices:
        devices?.results || [],

      browsers:
        browsers?.results || []
    });

  } catch (error) {
    console.error(
      "GET /api/analytics error:",
      error
    );

    return json(
      {
        error: "Unable to load analytics."
      },
      500
    );
  }
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
