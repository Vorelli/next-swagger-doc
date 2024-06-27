import ono from "@jsdevtools/ono";
import mergeWith from "lodash.mergewith";
const maybe = require("call-me-maybe");
import $RefParser, {
  JSONSchema,
  ParserOptions,
} from "@apidevtools/json-schema-ref-parser";
import OpenAPI from "openapi-types";
import {
  Options,
  getNewOptions,
} from "@apidevtools/json-schema-ref-parser/dist/lib/options";

function isTagPresentInTags(tag: { name: string }, tags: { name: string }[]) {
  const match = tags.find((targetTag) => tag.name === targetTag.name);
  if (match) return true;

  return false;
}

export function organize(swaggerObject: any, annotation: any, property: any) {
  // Root property on purpose.
  // @see https://github.com/OAI/OpenAPI-Specification/blob/master/proposals/002_Webhooks.md#proposed-solution
  if (property === "x-webhooks") {
    swaggerObject[property] = mergeDeep(
      swaggerObject[property],
      annotation[property]
    );
  }

  // Other extensions can be in varying places depending on different vendors and opinions.
  // The following return makes it so that they are not put in `paths` in the last case.
  // New specific extensions will need to be handled on case-by-case if to be included in `paths`.
  if (property.startsWith("x-")) return;

  const commonProperties = [
    "components",
    "consumes",
    "produces",
    "paths",
    "schemas",
    "securityDefinitions",
    "responses",
    "parameters",
    "definitions",
    "channels",
  ];
  if (commonProperties.includes(property)) {
    for (const definition of Object.keys(annotation[property])) {
      swaggerObject[property][definition] = mergeDeep(
        swaggerObject[property][definition],
        annotation[property][definition]
      );
    }
  } else if (property === "tags") {
    const { tags } = annotation;

    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (!isTagPresentInTags(tag, swaggerObject.tags)) {
          swaggerObject.tags.push(tag);
        }
      }
    } else if (!isTagPresentInTags(tags, swaggerObject.tags)) {
      swaggerObject.tags.push(tags);
    }
  } else {
    // Paths which are not defined as "paths" property, starting with a slash "/"
    swaggerObject.paths[property] = mergeDeep(
      swaggerObject.paths[property],
      annotation[property]
    );
  }
}

function isHttpMethod(i: any): i is keyof OpenAPI.OpenAPIV3.HttpMethods {
  if (
    typeof i === "string" &&
    typeof OpenAPI.OpenAPIV3.HttpMethods[i as "GET"] === "string"
  ) {
    return true;
  }
  return false;
}
export type ApiCallback = (
  err: Error | null,
  api?: OpenAPI.OpenAPIV3_1.Document
) => any;
export class Parser<S extends object, O extends ParserOptions<S>> {
  async parse(
    routePath: string,
    path: string,
    api: string | OpenAPI.OpenAPIV3_1.Document,
    options: {},
    callback: ApiCallback
  ) {
    let args = {
      path,
      schema: api,
      options,
      callback,
    };

    try {
      let schema: any = {
        res: await $RefParser.prototype.parse.call(
          this,
          args.path,
          args.schema,
          args.options,
          () => {}
        ),
      }.res;
      const path: Record<string, any> = {};

      for (const i in OpenAPI.OpenAPIV3.HttpMethods) {
        if (isHttpMethod(i) && schema[i]) {
          const current = path[routePath] ?? {};
          current[i] = schema[i];
          path[routePath] = current;
        }
      }
      schema.path = path;

      if (schema.swagger) {
        // Verify that the parsed object is a Swagger API
        if (
          schema.swagger === undefined ||
          schema.info === undefined ||
          schema.paths === undefined
        ) {
          throw ono.syntax(
            `${args.path || args.schema} is not a valid Swagger API definition`
          );
        } else if (typeof schema.swagger === "number") {
          // This is a very common mistake, so give a helpful error message
          throw ono.syntax(
            'Swagger version number must be a string (e.g. "2.0") not a number.'
          );
        } else if (typeof schema.info.version === "number") {
          // This is a very common mistake, so give a helpful error message
          throw ono.syntax(
            'API version number must be a string (e.g. "1.0.0") not a number.'
          );
        } else if (schema.swagger !== "2.0") {
          throw ono.syntax(
            `Unrecognized Swagger version: ${schema.swagger}. Expected 2.0`
          );
        }
      } else {
        let supportedVersions = ["3.0.0", "3.0.1", "3.0.2", "3.0.3"];

        // Verify that the parsed object is a Openapi API
        if (
          schema.openapi === undefined ||
          schema.info === undefined ||
          schema.paths === undefined
        ) {
          throw ono.syntax(
            `${args.path || args.schema} is not a valid Openapi API definition`
          );
        } else if (typeof schema.openapi === "number") {
          // This is a very common mistake, so give a helpful error message
          throw ono.syntax(
            'Openapi version number must be a string (e.g. "3.0.0") not a number.'
          );
        } else if (typeof schema.info.version === "number") {
          // This is a very common mistake, so give a helpful error message
          throw ono.syntax(
            'API version number must be a string (e.g. "1.0.0") not a number.'
          );
        } else if (supportedVersions.indexOf(schema.openapi) === -1) {
          throw ono.syntax(
            `Unsupported OpenAPI version: ${schema.openapi}. ` +
              `Swagger Parser only supports versions ${supportedVersions.join(
                ", "
              )}`
          );
        }
      }

      // Looks good!
      return maybe(args.callback, Promise.resolve(schema));
    } catch (err) {
      return maybe(args.callback, Promise.reject(err));
    }
  }
}

export function normalizeArgs<
  S extends object = JSONSchema,
  O extends ParserOptions<S> = ParserOptions<S>
>(_args: Partial<IArguments>) {
  let path;
  let schema;
  let options: Options<S> & O;
  let callback;
  const args = Array.prototype.slice.call(_args) as any[];

  if (typeof args[args.length - 1] === "function") {
    // The last parameter is a callback function
    callback = args.pop();
  }

  if (typeof args[0] === "string") {
    // The first parameter is the path
    path = args[0];
    if (typeof args[2] === "object") {
      // The second parameter is the schema, and the third parameter is the options
      schema = args[1];
      options = args[2];
    } else {
      // The second parameter is the options
      schema = undefined;
      options = args[1];
    }
  } else {
    // The first parameter is the schema
    path = "";
    schema = args[0];
    options = args[1];
  }

  try {
    options = getNewOptions<S, O>(options);
  } catch (e) {
    console.error(`JSON Schema Ref Parser: Error normalizing options: ${e}`);
  }

  if (!options.mutateInputSchema && typeof schema === "object") {
    // Make a deep clone of the schema, so that we don't alter the original object
    schema = JSON.parse(JSON.stringify(schema));
  }

  return {
    path,
    schema,
    options,
    callback,
  };
}

function mergeDeep(first: any, second: any) {
  return mergeWith({}, first, second, (a, b) => (b === null ? a : undefined));
}
