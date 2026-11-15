// The one API client for the website. `import { api } from "@/lib/api"` in client components.
import { createApi } from "@trojanhub/shared/api";

import { getAccessToken } from "./supabase";

// "/" = same origin (the site forwards /api to the AI service, see next.config.ts).
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = createApi({ baseUrl: API_URL, getToken: getAccessToken });
