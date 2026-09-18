# Controller & Route Comment Format

When creating or modifying controller functions and route handlers, always include a JSDoc-style comment block directly above the function using the exact following format:

```typescript
/**
 * @Description [A brief description of what the controller does]
 * @Route [HTTP_METHOD] [route_path]
 * @Access [Public | Private]
 */
```
