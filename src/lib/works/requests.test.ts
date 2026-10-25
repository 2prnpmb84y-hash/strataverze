import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));

const uploads = vi.hoisted(() => ({
  verifyUpload: vi.fn(),
  consumeUpload: vi.fn(async (_id: string, create: () => Promise<unknown>) => create()),
}));
vi.mock("@/lib/storage/uploads", () => uploads);
const storage = vi.hoisted(() => ({ signDownloads: vi.fn(async (paths: string[]) => paths.map((p) => `https://signed/${p}`)) }));
vi.mock("@/lib/storage/server-storage", () => storage);

import { sharedFake } from "@/test/fake-orm";
import { checkRequest, requestPhotos, resubmitRequest, submitRequest } from "./requests";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const UP1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const good = { title: "Leak in the car park", trade: "Plumbing", location: "Basement", description: "Water dripping from the ceiling since Monday.", isEmergency: false, photoUploadIds: [] as string[] };

beforeEach(() => {
  sharedFake.reset({ WorksRequest: [], WorksRequestVersion: [], WorksDocument: [] });
  uploads.verifyUpload.mockReset();
  uploads.verifyUpload.mockImplementation(async (i: { uploadId: string; schemeId: string }) => ({ uploadId: i.uploadId, path: `schemes/${i.schemeId}/works/${i.uploadId}.jpg`, fileName: "leak.jpg", size: 1000, mimeType: "image/jpeg" }));
});

describe("checking the request form", () => {
  it("accepts a complete request", () => {
    expect(checkRequest({ ...good, isEmergency: "on" })).toEqual({ ok: true, value: { ...good, isEmergency: true } });
  });

  it("names each problem", () => {
    const r = checkRequest({ title: "", trade: "Wizardry", description: "short", photoUploadIds: ["a", "a"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["description", "photos", "title", "trade"]);
  });

  it("refuses more photos than allowed, and a title with a line break", () => {
    const r = checkRequest({ ...good, title: "a\nb", photoUploadIds: ["1", "2", "3", "4", "5", "6", "7"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toMatchObject({ title: expect.any(String), photos: expect.stringMatching(/up to 6/) });
  });
});

describe("raising a request", () => {
  it("numbers requests per building and sends them to the committee", async () => {
    const r1 = await submitRequest(A, "owner", good);
    const r2 = await submitRequest(A, "owner", good);
    const other = await submitRequest(B, "owner", good);
    expect([r1.requestNumber, r2.requestNumber, other.requestNumber]).toEqual(["WR-0001", "WR-0002", "WR-0001"]);
    const row = sharedFake.table("WorksRequest").find((r) => r.id === r1.id)!;
    expect(row).toMatchObject({ schemeId: A, status: "SUBMITTED", raisedById: "owner", trade: "Plumbing", currentVersion: 1, priority: "MEDIUM" });
    expect(sharedFake.table("WorksRequestVersion").filter((v) => v.requestId === r1.id)).toHaveLength(1);
  });

  it("checks photos before saving anything, then attaches them", async () => {
    uploads.verifyUpload.mockRejectedValueOnce(new Error("The upload could not be found."));
    await expect(submitRequest(A, "owner", { ...good, photoUploadIds: [UP1] })).rejects.toThrow(/could not be found/);
    expect(sharedFake.table("WorksRequest")).toHaveLength(0);

    const r = await submitRequest(A, "owner", { ...good, photoUploadIds: [UP1] });
    expect(uploads.verifyUpload).toHaveBeenLastCalledWith({ uploadId: UP1, schemeId: A, purpose: "works_photo", profileId: "owner" });
    expect(sharedFake.table("WorksDocument")).toEqual([expect.objectContaining({ requestId: r.id, schemeId: A, documentType: "PHOTO", fileUrl: `schemes/${A}/works/${UP1}.jpg` })]);
  });

  it("signs links only for photos inside the building's folder", async () => {
    sharedFake.reset({
      WorksDocument: [
        { id: "d1", requestId: "req", schemeId: A, documentType: "PHOTO", fileUrl: `schemes/${A}/works/x.jpg`, fileName: "x.jpg", deletedAt: null },
        { id: "d2", requestId: "req", schemeId: A, documentType: "PHOTO", fileUrl: `schemes/${B}/works/y.jpg`, fileName: "y.jpg", deletedAt: null },
      ],
    });
    const photos = await requestPhotos(A, "req");
    expect(photos.map((p) => p.id)).toEqual(["d1"]);
  });
});

describe("changing a returned request", () => {
  async function returned() {
    const r = await submitRequest(A, "owner", good);
    Object.assign(sharedFake.table("WorksRequest").find((x) => x.id === r.id)!, { status: "DRAFT", returnReason: "Which bay?" });
    return r;
  }

  it("lets whoever raised it send it again as a new version", async () => {
    const r = await returned();
    await resubmitRequest(A, r.id, "owner", { ...good, location: "Bay 14" });
    const row = sharedFake.table("WorksRequest").find((x) => x.id === r.id)!;
    expect(row).toMatchObject({ status: "SUBMITTED", location: "Bay 14", currentVersion: 2 });
    expect(sharedFake.table("WorksRequestVersion").filter((v) => v.requestId === r.id).map((v) => v.versionNumber)).toEqual([1, 2]);
  });

  it("refuses anyone else, another building, and a request not returned", async () => {
    const r = await returned();
    await expect(resubmitRequest(A, r.id, "someone-else", good)).rejects.toThrow(/not found/);
    await expect(resubmitRequest(B, r.id, "owner", good)).rejects.toThrow(/not found/);
    Object.assign(sharedFake.table("WorksRequest").find((x) => x.id === r.id)!, { status: "PROCUREMENT" });
    await expect(resubmitRequest(A, r.id, "owner", good)).rejects.toThrow(/Only a request the committee returned/);
  });

  it("keeps the photo limit across both sends", async () => {
    const r = await returned();
    sharedFake.table("WorksDocument").push(...Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, requestId: r.id, schemeId: A, documentType: "PHOTO", deletedAt: null })));
    await expect(resubmitRequest(A, r.id, "owner", { ...good, photoUploadIds: [UP1, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"] })).rejects.toThrow(/up to 6 photos in all/);
  });
});
