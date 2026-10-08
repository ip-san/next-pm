import { describe, expect, it, mock } from "bun:test";
import { enqueueNotification } from "./enqueue-notification";
import type { Job } from "@/domain/job/entity";
import type { JobRepository } from "@/domain/job/repository";

function makeRepo(): JobRepository {
  return {
    enqueue: mock(async (jobType, payload) => ({ id: "job-1", jobType, payload, status: "pending", attempts: 0, availableAt: new Date(), createdAt: new Date() }) as Job),
    claimNext: mock(async () => null),
    markDone: mock(async () => {}),
    markFailed: mock(async () => {}),
  };
}

describe("enqueueNotification", () => {
  it("enqueues a notify job for the deduped recipient union", async () => {
    const jobRepository = makeRepo();
    await enqueueNotification({ jobRepository }, {
      recipientGroups: [["a", "b"], ["b", "c"]],
      excludeUserId: null,
      subject: "Subject",
      body: "Body",
    });
    expect(jobRepository.enqueue).toHaveBeenCalledWith("notify", {
      recipientIds: ["a", "b", "c"],
      recipientAddresses: [],
      actorUserId: null,
      subject: "Subject",
      body: "Body",
    });
  });

  it("does not enqueue when the recipient union is empty", async () => {
    const jobRepository = makeRepo();
    await enqueueNotification({ jobRepository }, { recipientGroups: [[]], excludeUserId: null, subject: "s", body: "b" });
    expect(jobRepository.enqueue).not.toHaveBeenCalled();
  });

  it("still enqueues when the only recipient is the actor — whether they get a copy is their preference now", async () => {
    // Previously the actor was dropped here, so such a job was never created. The decision
    // moved to dispatchJob, which can read no_self_notified; see enqueue-notification.ts.
    const jobRepository = makeRepo();
    await enqueueNotification({ jobRepository }, { recipientGroups: [["actor-1"]], excludeUserId: "actor-1", subject: "s", body: "b" });
    expect(jobRepository.enqueue).toHaveBeenCalledWith("notify", {
      recipientIds: ["actor-1"],
      recipientAddresses: [],
      actorUserId: "actor-1",
      subject: "s",
      body: "b",
    });
  });

  it("enqueues for literal addresses even when no user resolves", async () => {
    const jobRepository = makeRepo();
    await enqueueNotification({ jobRepository }, {
      recipientGroups: [],
      recipientAddresses: ["gone@example.com"],
      excludeUserId: null,
      subject: "s",
      body: "b",
    });
    expect(jobRepository.enqueue).toHaveBeenCalled();
  });
});
