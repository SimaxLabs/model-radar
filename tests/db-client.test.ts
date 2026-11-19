import { expect, it, vi } from "vitest";
import { getDatabase } from "$lib/server/db/client";

vi.mock("$env/dynamic/private", () => ({ env: { DATABASE_URL: ":memory:" } }));
vi.mock("@libsql/client/node", async (importOriginal) => {
  const { createClient } = await importOriginal<typeof import("@libsql/client/node")>();
  return {
    createClient: (...args: Parameters<typeof createClient>) => {
      const client = createClient(...args);
      vi.spyOn(client, "execute").mockRejectedValueOnce(new Error("temporary setup failure"));
      return client;
    },
  };
});

it("retries a failed schema setup on the next request", async () => {
  await expect(getDatabase()).rejects.toThrow("temporary setup failure");
  const { client } = await getDatabase();
  expect((await client.execute("SELECT * FROM price_snapshots")).rows).toEqual([]);
  client.close();
});
