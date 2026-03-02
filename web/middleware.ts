export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/products/:path*",
    "/api/voice/:path*",
    "/api/clients/:path*",
    "/api/settings/:path*",

    "/echome/dashboard/:path*",
    "/echome/api/products/:path*",
    "/echome/api/voice/:path*",
    "/echome/api/clients/:path*",
    "/echome/api/settings/:path*",
  ],
};
