import { describe, expect, it, vi } from "vitest";
import { emitAgentEvent, resetAgentRunContextForTest } from "../infra/agent-events.js";
import { createHookRunner } from "./hooks.js";
import { createPluginRegistry, type PluginRecord } from "./registry.js";
import type { PluginRuntime } from "./runtime/types.js";

function createTestRecord(): PluginRecord {
  return {
    id: "test-plugin",
    name: "test-plugin",
    source: "test-source",
    origin: "bundled",
    enabled: true,
    status: "loaded",
    toolNames: [],
    hookNames: [],
    channelIds: [],
    providerIds: [],
    gatewayMethods: [],
    cliCommands: [],
    services: [],
    commands: [],
    httpRoutes: 0,
    hookCount: 0,
    configSchema: false,
  };
}

describe("plugin api onAgentEvent", () => {
  it("forwards matching agent events to plugin listeners", () => {
    resetAgentRunContextForTest();
    const { createApi } = createPluginRegistry({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {} as PluginRuntime,
    });
    const record = createTestRecord();
    const api = createApi(record, { config: {} });
    const listener = vi.fn();

    const unsubscribe = api.onAgentEvent(listener);
    emitAgentEvent({
      runId: "run-1",
      stream: "assistant",
      data: { text: "hello" },
      sessionKey: "session-1",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      runId: "run-1",
      stream: "assistant",
      sessionKey: "session-1",
      data: { text: "hello" },
    });
    unsubscribe();
  });

  it("filters agent events by runId and sessionKey", () => {
    resetAgentRunContextForTest();
    const { createApi } = createPluginRegistry({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {} as PluginRuntime,
    });
    const record = createTestRecord();
    const api = createApi(record, { config: {} });
    const listener = vi.fn();

    const unsubscribe = api.onAgentEvent(listener, {
      runId: "run-match",
      sessionKey: "session-match",
    });
    emitAgentEvent({
      runId: "run-skip",
      stream: "assistant",
      data: { text: "skip-1" },
      sessionKey: "session-match",
    });
    emitAgentEvent({
      runId: "run-match",
      stream: "assistant",
      data: { text: "skip-2" },
      sessionKey: "session-other",
    });
    emitAgentEvent({
      runId: "run-match",
      stream: "assistant",
      data: { text: "ok" },
      sessionKey: "session-match",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      runId: "run-match",
      sessionKey: "session-match",
      data: { text: "ok" },
    });
    unsubscribe();
  });

  it("unsubscribes manually and on gateway_stop", async () => {
    resetAgentRunContextForTest();
    const { registry, createApi } = createPluginRegistry({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      runtime: {} as PluginRuntime,
    });
    const record = createTestRecord();
    const api = createApi(record, { config: {} });
    const listener = vi.fn();

    const unsubscribe = api.onAgentEvent(listener);
    unsubscribe();

    emitAgentEvent({
      runId: "run-manual",
      stream: "assistant",
      data: { text: "skip" },
      sessionKey: "session-1",
    });

    expect(listener).not.toHaveBeenCalled();

    api.onAgentEvent(listener);
    const runner = createHookRunner(registry);
    await runner.runGatewayStop({ reason: "shutdown" }, {});

    emitAgentEvent({
      runId: "run-stop",
      stream: "assistant",
      data: { text: "skip-after-stop" },
      sessionKey: "session-1",
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
