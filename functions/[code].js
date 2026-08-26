export async function onRequest(context) {
  const { request, env, params } = context;

  const url = new URL(request.url);
  const pathname = url.pathname;

  /*
   * Serve uploaded OG images from R2.
   *
   * Example:
   * /og/abc123-randomid.jpg
   */
  if (pathname.startsWith("/og/")) {
    if (!env.IMAGES) {
      return new Response("Image storage is not configured.", {
        status: 500
      });
    }

    const objectKey = decodeURIComponent(
      pathname.slice("/og/".length)
    );

    if (!objectKey || objectKey.includes("..")) {
      return new Response("Invalid image.", {
        status: 400
      });
    }

    const object = await env.IMAGES.get(objectKey);

    if (!object) {
      return new Response("Image not found.", {
        status: 404
      });
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);

    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );

    headers.set(
      "ETag",
      object.httpEtag
    );

    return new Response(object.body, {
      status: 200,
      headers
    });
  }

  /*
   * Only handle normal short-link requests.
   */
  const code =
    String(params.code || "").trim();

  if (!code) {
    return new Response("Not found.", {
      status: 404
    });
  }

  /*
   * Look up the short link.
   */
  const link = await env.DB.prepare(
    `
      SELECT
        id,
        code,
        url,
        title,
        og_image,
        active
      FROM links
      WHERE code = ?
      LIMIT 1
    `
  )
    .bind(code)
    .first();

  if (!link) {
    return new Response(
      createNotFoundPage(),
      {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=UTF-8"
        }
      }
    );
  }

  if (Number(link.active) === 0) {
    return new Response(
      createInactivePage(),
      {
        status: 410,
        headers: {
          "Content-Type": "text/html; charset=UTF-8"
        }
      }
    );
  }

  /*
   * If a browser/crawler requests the short URL,
   * return OG metadata first.
   *
   * Crawlers such as Facebook, WhatsApp, Telegram,
   * Discord and other preview systems can read these
   * tags before the actual redirect.
   */
  const userAgent =
    request.headers.get("User-Agent") || "";

  if (isPreviewBot(userAgent)) {
    const imageUrl =
      link.og_image
        ? new URL(
            link.og_image,
            url.origin
          ).href
        : "";

    return new Response(
      createPreviewPage({
        title:
          link.title ||
          "Short Link",
        description:
          link.url,
        destination:
          link.url,
        image:
          imageUrl
      }),
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/html; charset=UTF-8",
          "Cache-Control":
            "public, max-age=60"
        }
      }
    );
  }

  /*
   * Collect visitor information.
   */
  const country =
    request.headers.get(
      "CF-IPCountry"
    ) || null;

  const city =
    request.cf?.city || null;

  const userAgentString =
    request.headers.get(
      "User-Agent"
    ) || "";

  const referrer =
    request.headers.get(
      "Referer"
    ) || null;

  const device =
    detectDevice(
      userAgentString
    );

  const browser =
    detectBrowser(
      userAgentString
    );

  const os =
    detectOS(
      userAgentString
    );

  /*
   * Create a privacy-friendly visitor ID.
   *
   * We do not store the raw IP address.
   */
  const ip =
    request.headers.get(
      "CF-Connecting-IP"
    ) || "";

  const visitorId =
    await createVisitorId(
      ip,
      userAgentString,
      env
    );

  const now =
    new Date().toISOString();

  /*
   * Record analytics.
   */
  try {
    await env.DB.prepare(
      `
        INSERT INTO analytics (
          link_id,
          visitor_id,
          country,
          city,
          device,
          browser,
          os,
          referrer,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        link.id,
        visitorId,
        country,
        city,
        device,
        browser,
        os,
        referrer,
        now
      )
      .run();
  } catch (error) {
    /*
     * Analytics failure should never prevent
     * the visitor from reaching the destination.
     */
    console.error(
      "Analytics insert failed:",
      error
    );
  }

  /*
   * Increase click counter.
   */
  try {
    await env.DB.prepare(
      `
        UPDATE links
        SET clicks = COALESCE(clicks, 0) + 1
        WHERE id = ?
      `
    )
      .bind(link.id)
      .run();
  } catch (error) {
    console.error(
      "Click counter update failed:",
      error
    );
  }

  /*
   * Redirect to the original URL.
   */
  return Response.redirect(
    link.url,
    302
  );
}

function isPreviewBot(userAgent) {
  const ua =
    userAgent.toLowerCase();

  const bots = [
    "facebookexternalhit",
    "facebot",
    "twitterbot",
    "linkedinbot",
    "slackbot",
    "discordbot",
    "telegrambot",
    "whatsapp",
    "googlebot",
    "bingbot",
    "applebot",
    "pinterest",
    "embedly",
    "crawler",
    "spider",
    "preview"
  ];

  return bots.some(
    bot => ua.includes(bot)
  );
}

function detectDevice(userAgent) {
  const ua =
    userAgent.toLowerCase();

  if (
    ua.includes("tablet") ||
    ua.includes("ipad") ||
    ua.includes("android") &&
      !ua.includes("mobile")
  ) {
    return "Tablet";
  }

  if (
    ua.includes("mobile") ||
    ua.includes("iphone") ||
    ua.includes("ipod")
  ) {
    return "Mobile";
  }

  return "Desktop";
}

function detectBrowser(userAgent) {
  const ua =
    userAgent.toLowerCase();

  if (ua.includes("edg/")) {
    return "Edge";
  }

  if (
    ua.includes("opr/") ||
    ua.includes("opera")
  ) {
    return "Opera";
  }

  if (
    ua.includes("chrome/") &&
    !ua.includes("edg/")
  ) {
    return "Chrome";
  }

  if (
    ua.includes("firefox/")
  ) {
    return "Firefox";
  }

  if (
    ua.includes("safari/") &&
    !ua.includes("chrome/")
  ) {
    return "Safari";
  }

  if (
    ua.includes("msie") ||
    ua.includes("trident/")
  ) {
    return "Internet Explorer";
  }

  return "Unknown";
}

function detectOS(userAgent) {
  const ua =
    userAgent.toLowerCase();

  if (ua.includes("windows")) {
    return "Windows";
  }

  if (
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    ua.includes("ios")
  ) {
    return "iOS";
  }

  if (ua.includes("android")) {
    return "Android";
  }

  if (
    ua.includes("mac os") ||
    ua.includes("macintosh")
  ) {
    return "macOS";
  }

  if (ua.includes("linux")) {
    return "Linux";
  }

  return "Unknown";
}

async function createVisitorId(
  ip,
  userAgent,
  env
) {
  /*
   * Hash the IP + User-Agent rather than
   * storing the raw IP address.
   */
  const input =
    `${ip}|${userAgent}`;

  const data =
    new TextEncoder().encode(
      input
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  const bytes =
    new Uint8Array(hash);

  return Array.from(bytes)
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function createPreviewPage({
  title,
  description,
  destination,
  image
}) {
  const safeTitle =
    escapeHtml(title);

  const safeDescription =
    escapeHtml(description);

  const safeDestination =
    escapeHtml(destination);

  const safeImage =
    escapeHtml(image);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <title>${safeTitle}</title>

  <meta
    name="description"
    content="${safeDescription}"
  >

  <meta
    property="og:title"
    content="${safeTitle}"
  >

  <meta
    property="og:description"
    content="${safeDescription}"
  >

  <meta
    property="og:type"
    content="website"
  >

  ${
    safeImage
      ? `
  <meta
    property="og:image"
    content="${safeImage}"
  >
  `
      : ""
  }

  <meta
    property="og:url"
    content="${safeDestination}"
  >

  <meta
    name="twitter:card"
    content="${
      safeImage
        ? "summary_large_image"
        : "summary"
    }"
  >

  <meta
    name="twitter:title"
    content="${safeTitle}"
  >

  <meta
    name="twitter:description"
    content="${safeDescription}"
  >

  ${
    safeImage
      ? `
  <meta
    name="twitter:image"
    content="${safeImage}"
  >
  `
      : ""
  }
</head>

<body>
  <p>
    <a href="${safeDestination}">
      Continue to destination
    </a>
  </p>
</body>
</html>`;
}

function createNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Link Not Found</title>
</head>

<body>
  <h1>Link Not Found</h1>
  <p>
    This short link does not exist.
  </p>
</body>
</html>`;
}

function createInactivePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Link Inactive</title>
</head>

<body>
  <h1>Link Inactive</h1>
  <p>
    This short link has been disabled.
  </p>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}
