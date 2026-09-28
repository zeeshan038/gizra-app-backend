# Swagger Documentation Rule

Whenever a new API route or endpoint is created, you MUST automatically update the corresponding Swagger API documentation to include it. Run `npm run swagger:gen` so the four role specs stay in sync (`swagger-customer.json`, `swagger-vendor.json`, `swagger-driver.json`, `swagger-admin.json`).

**Hand-maintained docs:** Rich request/response shapes live in `swagger.openapi-overlay.json` (merged on top of swagger-autogen). When adding or changing an API, update the matching path/method and `components.schemas` in that overlay file, then run `swagger:gen`.

When documenting the API in Swagger, ensure the following are always provided accurately and comprehensively:
1. **Proper URL**: The exact route path and HTTP method.
2. **Request Body**: Define the required and optional payload fields clearly with appropriate data types.
3. **Response Object**: Provide a fully detailed and structured response object. **Do not use empty objects (`{}`)**. The documented response must accurately reflect the actual JSON structure returned by the API on a successful request.
4. **Error Codes**: Include all possible HTTP error status codes (e.g., 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error) that the endpoint might return, along with their specific response structures and messages.
