import { supabase } from "../api";
export async function academyAdmin(
  action: string,
  data: Record<string, unknown> = {},
) {
  const jwt = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (!jwt) throw Error("access_denied");
  const root = import.meta.env.VITE_PLATFORM_API_URL || "";
  const r = await fetch(root + "/academy/admin", {
    method: "POST",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwt,
    },
    body: JSON.stringify({ action, data }),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error);
  return b;
}
export async function academyFile(file: File, kind: "image" | "material") {
  if (file.size > 5242880) throw Error("academy_material_invalid");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { name: file.name, kind, base64 };
}
