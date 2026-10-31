import type { MetadataRoute } from "next";

/**
 * The app (app.strataverze.com) is not for search engines (AR-015): every
 * page is behind sign-in or is a sign-in page. The public site,
 * www.strataverze.com, is a separate project with its own robots.txt.
 * No sitemap. src/proxy.ts lets /robots.txt through untouched.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
