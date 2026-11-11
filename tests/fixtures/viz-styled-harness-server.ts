import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

/**
 * Bundles a harness entry with the app's real `globals.css` (Tailwind
 * compiled) and serves it on a free localhost port — the Visualizations
 * tab's browser specs share it so the lightbox and the wall are measured
 * with their real styles. Server actions and `next/navigation` are mocked.
 */
export async function startStyledHarness(
  entry: string,
  options: {
    /** Further webpack aliases — a harness that renders `next/link`, say,
     *  points it at `next-link-browser-mock.tsx`. */
    alias?: Record<string, string>;
  } = {},
): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const outputPath = mkdtempSync(join(tmpdir(), "viz-styled-"));
  const webpack = (
    nextWebpack as unknown as {
      webpack: (
        config: unknown,
        cb: (
          error: Error | null,
          stats: { toJson(): { errors?: unknown[] } },
        ) => void,
      ) => void;
    }
  ).webpack;
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(entry),
        // `publicPath` so a `next/dynamic` chunk (the lightbox) loads from
        // this server too; every emitted file is served below.
        output: { path: outputPath, filename: "bundle.js", publicPath: "/" },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              exclude: /node_modules/,
              use: resolve("tests/fixtures/tsx-transpile-loader.js"),
            },
          ],
        },
        resolve: {
          extensions: [".tsx", ".ts", ".jsx", ".js"],
          alias: {
            "@/lib/posthog-client$": resolve(
              "tests/fixtures/posthog-client-off-mock.ts",
            ),
            "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
            ...options.alias,
            "@": resolve("src"),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  if ((result.errors ?? []).length > 0)
    throw new Error(JSON.stringify(result.errors).slice(0, 4000));
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  const stylesheet = (
    await postcss([tailwindcss()]).process(
      readFileSync(resolve("src/app/globals.css"), "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;
  const server: Server = createServer((request, response) => {
    const path = request.url ?? "/";
    // A lazily-loaded chunk webpack emitted beside the bundle.
    const chunk = /^\/([\w.-]+\.js)(\?.*)?$/.exec(path);
    if (chunk && chunk[1] !== "bundle.js") {
      try {
        const body = readFileSync(join(outputPath, chunk[1]));
        response.setHeader("content-type", "text/javascript; charset=utf-8");
        response.end(body);
      } catch {
        response.statusCode = 404;
        response.end();
      }
      return;
    }
    response.setHeader(
      "content-type",
      path.startsWith("/bundle.js")
        ? "text/javascript; charset=utf-8"
        : path.startsWith("/style.css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    );
    response.end(
      path.startsWith("/bundle.js")
        ? bundle
        : path.startsWith("/style.css")
          ? stylesheet
          : '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.process = { env: { NODE_ENV: "development" } };</script><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      if (server.listening)
        await new Promise<void>((done, reject) =>
          server.close((error) => (error ? reject(error) : done())),
        );
      rmSync(outputPath, { recursive: true, force: true });
    },
  };
}
