# Services return an ApiResponse result instead of throwing HTTP exceptions

Application services return an `ApiResponse<T>` envelope (success flag, status code, data or error, and optional pagination meta). Controllers write it themselves with `res.status(r.statusCode).json(r)`. This deliberately departs from the usual NestJS approach (throw `HttpException`, map it in exception filters) that the bundled nestjs-best-practices skill recommends. The benefits are one response shape for every client and failures that show up in the return type.

## Consequences

- Global exception filters and interceptors never see business errors.
- Every caller has to check `ok` explicitly. Treating the envelope as truthy has already caused bugs (`resetPassword`).
- Pagination uses the shared `createPaginationMeta`: default limit 20, capped at 100, with `_id` as a tie-breaker in sorting.
