# Swagger Documentation Rule

Whenever a new API route or endpoint is created, you MUST automatically update the corresponding Swagger API documentation to include it.

When documenting the API in Swagger, ensure the following are always provided accurately and comprehensively:
1. **Proper URL**: The exact route path and HTTP method.
2. **Request Body**: Define the required and optional payload fields clearly with appropriate data types.
3. **Response Object**: Provide a fully detailed and structured response object. **Do not use empty objects (`{}`)**. The documented response must accurately reflect the actual JSON structure returned by the API on a successful request.
4. **Error Codes**: Include all possible HTTP error status codes (e.g., 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error) that the endpoint might return, along with their specific response structures and messages.
