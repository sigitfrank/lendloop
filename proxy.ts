import { clerkMiddleware } from "@clerk/nextjs/server";

// Makes the Clerk session available to server components and route handlers.
// Route protection lives in each protected layout (`auth.protect()`), and real
// authorisation lives in Convex functions.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk frontend API routes
    "/__clerk/(.*)",
  ],
};
