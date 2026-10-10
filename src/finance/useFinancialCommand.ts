import { useRef } from "react";
import { rpc } from "../api";
/** Keep the same command key after a transport error. A retry cannot create a second receipt. */
export function useFinancialCommand() {
  const pending = useRef<{ signature: string; key: string } | null>(null);
  return async function command<T = any>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { p_key: ignored, ...payload } = args;
    const signature = JSON.stringify([name, payload]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    const result = await rpc<T>(name, {
      ...payload,
      p_key: pending.current.key,
    });
    pending.current = null;
    return result;
  };
}
