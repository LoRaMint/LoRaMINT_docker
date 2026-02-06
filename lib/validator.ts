import { validator } from "hono-openapi";
import type { ZodType } from "zod";
import type { ValidationTargets, Context } from "hono";

/**
 * Zod validator middleware with pretty error messages and OpenAPI support.
 * Uses hono-openapi validator for automatic OpenAPI schema generation.
 */
export const v = <Target extends keyof ValidationTargets, T extends ZodType>(target: Target, schema: T) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator(target, schema, (result: any, c: Context) => {
    if (!result.success) {
      const errorMessage = result.error
        ?.map((issue: any) => {
          const path = issue.path
            ?.map((p: any) => (typeof p === "object" && p !== null && "key" in p ? String(p.key) : String(p)))
            .join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join(", ");
      return c.json({ message: errorMessage || "Validation failed" }, 400);
    }
  });
