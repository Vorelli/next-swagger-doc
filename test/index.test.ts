import { describe, expect, it } from "vitest";

import { createSwaggerSpec } from "../src";

describe("withSwagger", () => {
  it("should create default swagger json option", async () => {
    await expect(
      createSwaggerSpec({
        definition: {
          openapi: "3.0.0",
          info: {
            title: "NextJS Swagger",
            version: "0.1.0",
          },
        },
      })
    ).resolves.toMatchSnapshot();
  });

  it("should have Bearer Authentication", async () => {
    await expect(
      createSwaggerSpec({
        definition: {
          openapi: "3.0.0",
          info: {
            title: "NextJS Swagger",
            version: "0.1.0",
          },
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          },
          security: [
            {
              bearerAuth: [],
            },
          ],
        },
        apiFolder: "pages/api",
      })
    ).resolves.toMatchSnapshot();
  });

  it("should have support OAuth2 Authentication", async () => {
    await expect(
      createSwaggerSpec({
        definition: {
          openapi: "3.0.0",
          info: {
            title: "NextJS Swagger",
            version: "0.1.0",
          },
          components: {
            securitySchemes: {
              OAuth2: {
                type: "oauth2",
                description: "OAuth2 authentication with a bearer token.",
                flows: {
                  implicit: {
                    authorizationUrl: "https://example.com/authorize",
                    scopes: {
                      "read:pets": "read your pets",
                      "write:pets": "modify pets in your account",
                    },
                  },
                  password: {
                    tokenUrl: "https://example.com/token",
                    scopes: {
                      "read:pets": "read your pets",
                      "write:pets": "modify pets in your account",
                    },
                  },
                },
              },
            },
          },
          security: [
            {
              OAuth2: ["read", "write"],
            },
          ],
        },
        apiFolder: "test/test-api-folder/app",
      })
    ).resolves.toMatchSnapshot();
  });

  it.todo("Should work for normal next.js paths (App Router)");
  it.todo("Should work for dynamic next.js paths (App Router)");

  it.todo(
    "Should warn user when using path router cos I'm too lazy to implement that shit"
  );
});
