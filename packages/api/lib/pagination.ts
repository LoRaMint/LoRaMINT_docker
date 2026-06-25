import { z } from "zod";

export const PaginationResponseSchema = z.object({
  page: z.number().describe("Current page number"),
  per_page: z.number().describe("Items per page"),
  total: z.number().describe("Total number of items"),
  total_pages: z.number().describe("Total number of pages"),
  has_next: z.boolean().describe("Whether there are more pages"),
});

export type PaginationResponse = z.infer<typeof PaginationResponseSchema>;

export type PaginationParams = {
  page: number;
  perPage: number;
  offset: number;
};

/**
 * Parse pagination from validated query params
 * @param query - Validated query object with page and per_page
 * @returns Pagination params with calculated offset
 */
export const parsePagination = (query: { page?: number; per_page?: number }): PaginationParams => {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
};

/**
 * Create pagination response object
 * @param params - Current pagination params
 * @param total - Total number of items
 * @returns Pagination object for API response
 */
export const createPagination = (params: PaginationParams, total: number): PaginationResponse => {
  const totalPages = Math.ceil(total / params.perPage);
  return {
    page: params.page,
    per_page: params.perPage,
    total,
    total_pages: totalPages,
    has_next: params.page < totalPages,
  };
};
