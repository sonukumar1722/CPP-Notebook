// @ts-ignore: plugin types may not be available in this environment
import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  server: {
    port: 5173,
  },
};

