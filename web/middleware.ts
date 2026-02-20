export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/api/products/:path*", "/api/voice/:path*", "/api/clients/:path*"],
};
