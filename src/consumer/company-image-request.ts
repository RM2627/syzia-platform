// Share only requests that are still in flight. No resolved image or URL is
// cached, and each caller owns/revokes its own object URL.
const pending = new Map<string, Promise<Blob>>();
export function companyImageBytes(
  url: string,
  authorization: string,
  scope: string,
): Promise<Blob> {
  const key = JSON.stringify([url, authorization, scope]);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch(url, {
    headers: { Authorization: authorization },
  }).then(async (response) => {
    if (!response.ok) throw Error("image_unavailable");
    return response.blob();
  });
  pending.set(key, request);
  void request
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    })
    .catch(() => {});
  return request;
}
