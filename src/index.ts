import dotenv from "dotenv";

dotenv.config({ quiet: true });

import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 3000;

createApp().listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
