import traverse from "@babel/traverse";
import * as doctrine from "doctrine";
import { NextResponse, NextRequest } from "next/server";
import { type NextApiRequest, type NextApiResponse } from "next";
import { join } from "path";
import swaggerJsdoc, {
  type Paths,
  type OAS3Definition,
  type Options,
} from "swagger-jsdoc";
import { parse } from "yaml";
import { z } from "zod";
import { codeToAst } from "./helpers/codeToAST";
import { getRoutesAndCode } from "./helpers/getRoutesAndCode";

export type SwaggerOptions = Options & {
  apiFolder?: string;
  schemaFolders?: string[];
  definition: OAS3Definition;
  outputFile?: string;
};

const defaultOptions: SwaggerOptions = {
  apiFolder: "pages/api",
  schemaFolders: [],
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Next Swagger Doc Demo Api",
      version: "1.0",
    },
  },
};

/**
 * Create swagger JSON
 * @param options.openApiVersion Open API version {3.0.0}
 * @param options.apiFolder NextJS API folder {pages/api}
 * @param options.schemaFolders entity schema folders
 * @param options.title Title
 * @param options.version Version
 * @returns Swagger JSON Spec
 */
export function createSwaggerSpec({
  apiFolder = "pages/api",
  schemaFolders = [],
  ...swaggerOptions
}: SwaggerOptions = defaultOptions) {
  const scanFolders = [apiFolder, ...schemaFolders];
  const apis = scanFolders.flatMap((folder) => {
    const buildApiDirectory = join(process.cwd(), ".next/server", folder);
    const apiDirectory = join(process.cwd(), folder);
    const publicDirectory = join(process.cwd(), "public");
    const fileTypes = ["ts", "tsx", "jsx", "js", "json", "swagger.yaml"];
    return [
      ...fileTypes.map((fileType) => `${apiDirectory}/**/*.${fileType}`),
      // Only scan build directory for *.swagger.yaml and *.js files
      ...["js", "swagger.yaml", "json"].map(
        (fileType) => `${buildApiDirectory}/**/*.${fileType}`
      ),
      // Support load static files from public directory
      ...["swagger.yaml", "json"].map(
        (fileType) => `${publicDirectory}/**/*.${fileType}`
      ),
    ];
  });

  // For each of the api folders, parse as AST and get the route and possible return types
  const routesPathToCode = getRoutesAndCode(apiFolder);

  const paths: Paths = {};

  Object.entries(routesPathToCode).forEach(([route, code]) => {
    const ast = codeToAst(code);
    ((traverse as unknown as { default: typeof traverse }).default
      ? (traverse as unknown as { default: typeof traverse }).default
      : traverse)(ast, {
      enter(path) {
        if (path.node.leadingComments) {
          for (const comment of path.node.leadingComments) {
            if (comment.type === "CommentBlock") {
              const parsedComment = doctrine.parse(comment.value, {
                unwrap: true,
              });
              // Get the route tag
              const routeTag = parsedComment.tags.find(
                (tag) => tag.title === "route"
              );
              if (!routeTag) return;
              const routeDescription = routeTag.description;
              if (!routeDescription) return;
              const parsedYaml = parse(routeDescription);
              const schema = z.object({
                description: z.string(),
              });
              const { description } = schema.parse(parsedYaml);
              paths[route] = {
                get: {
                  description,
                },
              };
            }
          }
        }
      },
    });
  });
  // Convert that data and append it to the swagger options

  // Conditions: basePath is specified. Server array is not defined.
  const definition = {
    ...swaggerOptions.definition,
    paths: {
      ...paths,
      ...(swaggerOptions?.definition?.paths ?? {}),
    },
    ...(process.env.__NEXT_ROUTER_BASEPATH &&
      !swaggerOptions.definition.servers && {
        servers: [
          {
            url: process.env.__NEXT_ROUTER_BASEPATH,
            description: "next-js",
          },
        ],
      }),
  };

  const options: SwaggerOptions = {
    apis, // Files containing annotations as above
    ...swaggerOptions,
    definition,
  };

  const spec = swaggerJsdoc(options);

  // Delete the temporary folder

  return spec;
}

/**
 * WithSwagger middleware
 * @param options.openApiVersion Open API version {3.0.0}
 * @param options.apiFolder NextJS API folder {pages/api}
 * @param options.schemaFolders entity schema folders
 * @param options.title Title
 * @param options.version Version
 * @returns
 */
export function withSwagger({
  apiFolder = "pages/api",
  schemaFolders = [],
  ...swaggerOptions
}: SwaggerOptions = defaultOptions) {
  return () =>
    (
      _req: NextApiRequest | NextRequest,
      res: NextApiResponse | NextResponse
    ) => {
      try {
        const swaggerSpec = createSwaggerSpec({
          apiFolder,
          schemaFolders,
          ...swaggerOptions,
        });
        if (res.status) {
          return (res as NextApiResponse).status(200).send(swaggerSpec);
        } else {
          return NextResponse.json(swaggerSpec, { status: 200 });
        }
      } catch (error) {
        if (res.status) {
          return (res as NextApiResponse).status(400).send(error);
        } else {
          return NextResponse.json(error, { status: 400 });
        }
      }
    };
}
