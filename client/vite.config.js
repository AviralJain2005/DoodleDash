/** Vite configuration: enables the React plugin and Tailwind CSS integration. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Enable React JSX handling and Tailwind CSS processing in the Vite development/build pipeline.
export default defineConfig({ plugins: [react(), tailwindcss()] });
