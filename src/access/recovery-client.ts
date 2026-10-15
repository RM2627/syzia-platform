import { createClient } from "@supabase/supabase-js";
import { configured } from "../api";
import {
  createRecovery,
  recoveryStorage,
  recoveryStorageKey,
} from "./recovery-core";

export function newRecovery() {
  if (!configured) throw Error("recovery_unavailable");
  const storage = recoveryStorage(window.localStorage);
  const client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        storageKey: recoveryStorageKey,
        storage,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );
  return createRecovery(client.auth, storage);
}
