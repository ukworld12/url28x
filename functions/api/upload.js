export async function onRequestPost({ request, env }) {
  try {
    if (!env.IMAGES) {
      return json(
        {
          error:
            "Image storage is not configured. Add an R2 binding named IMAGES in Cloudflare Pages."
        },
        500
      );
    }

    const contentType =
      request.headers.get("Content-Type") || "";

    if (
      !contentType.toLowerCase().includes(
        "multipart/form-data"
      )
    ) {
      return json(
        {
          error:
            "Please upload the image using multipart/form-data."
        },
        400
      );
    }

    const formData =
      await request.formData();

    const file =
      formData.get("file");

    const code =
      String(
        formData.get("code") || ""
      ).trim();

    if (!(file instanceof File)) {
      return json(
        {
          error: "No image file was provided."
        },
        400
      );
    }

    if (!code) {
      return json(
        {
          error:
            "Short link code is required."
        },
        400
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif"
    ];

    if (!allowedTypes.includes(file.type)) {
      return json(
        {
          error:
            "Only JPG, PNG, WEBP and GIF images are allowed."
        },
        400
      );
    }

    const maxSize =
      5 * 1024 * 1024;

    if (file.size > maxSize) {
      return json(
        {
          error:
            "Image must be smaller than 5 MB."
        },
        400
      );
    }

    const link =
      await env.DB.prepare(
        `
          SELECT
            id,
            code,
            og_image
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
          error:
            "Short link not found."
        },
        404
      );
    }

    /*
     * Delete the old image from R2 when replacing it.
     */
    if (link.og_image) {
      try {
        const oldKey =
          extractObjectKey(
            link.og_image
          );

        if (oldKey) {
          await env.IMAGES.delete(
            oldKey
          );
        }
      } catch (error) {
        console.error(
          "Unable to delete old image:",
          error
        );
      }
    }

    const extension =
      getExtension(file.type);

    const randomBytes =
      new Uint8Array(16);

    crypto.getRandomValues(
      randomBytes
    );

    const randomId =
      Array.from(randomBytes)
        .map(byte =>
          byte
            .toString(16)
            .padStart(2, "0")
        )
        .join("");

    const objectKey =
      `og/${code}-${randomId}.${extension}`;

    const imageData =
      await file.arrayBuffer();

    await env.IMAGES.put(
      objectKey,
      imageData,
      {
        httpMetadata: {
          contentType: file.type,
          cacheControl:
            "public, max-age=31536000, immutable"
        },
        customMetadata: {
          code,
          originalName:
            file.name || "image",
          uploadedAt:
            new Date().toISOString()
        }
      }
    );

    /*
     * The image URL is served through the
     * /og/... route handled by [code].js.
     */
    const imageUrl =
      `/og/${encodeURIComponent(
        objectKey
      )}`;

    const now =
      new Date().toISOString();

    await env.DB.prepare(
      `
        UPDATE links
        SET
          og_image = ?,
          updated_at = ?
        WHERE id = ?
      `
    )
      .bind(
        imageUrl,
        now,
        link.id
      )
      .run();

    return json({
      success: true,
      message:
        "OG image uploaded successfully.",
      imageUrl
    });

  } catch (error) {
    console.error(
      "POST /api/upload error:",
      error
    );

    return json(
      {
        error:
          "Unable to upload image."
      },
      500
    );
  }
}

function getExtension(type) {
  switch (type) {
    case "image/jpeg":
      return "jpg";

    case "image/png":
      return "png";

    case "image/webp":
      return "webp";

    case "image/gif":
      return "gif";

    default:
      return "bin";
  }
}

function extractObjectKey(url) {
  if (!url) {
    return null;
  }

  if (!url.startsWith("/og/")) {
    return null;
  }

  return decodeURIComponent(
    url.slice(4)
  );
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        "Cache-Control":
          "no-store"
      }
    }
  );
}
