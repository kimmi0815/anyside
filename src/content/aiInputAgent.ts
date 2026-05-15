import { createAIInputAdapter, detectAIInputService } from "../features/composer/adapters/index.js";
import type { AIService } from "../features/composer/types.js";

type RuntimePort = {
  postMessage(message: unknown): void;
  onMessage: {
    addListener(callback: (message: unknown) => void): void;
  };
  onDisconnect?: {
    addListener(callback: () => void): void;
  };
};

type RuntimeWithConnect = typeof chrome.runtime & {
  connect(details: { name: string }): RuntimePort;
};

type InsertTextMessage = {
  type: "INSERT_TEXT";
  text: string;
  requestId?: string;
  service?: AIService;
};

type AgentMessage = InsertTextMessage;

const currentUrl = new URL(window.location.href);
const service = detectAIInputService(currentUrl);
const adapter = createAIInputAdapter(service);
const port = (chrome.runtime as RuntimeWithConnect).connect({ name: "ai-input-agent" });

port.postMessage({
  type: "AI_AGENT_READY",
  service,
  url: currentUrl.href
});

port.onMessage.addListener((message) => {
  void handleMessage(message);
});

async function handleMessage(message: unknown): Promise<void> {
  if (!isInsertTextMessage(message)) {
    return;
  }

  const requestedAdapter = message.service ? createAIInputAdapter(message.service) : adapter;
  const result = await requestedAdapter.insertText(message.text);

  port.postMessage({
    type: "INSERT_TEXT_RESULT",
    requestId: message.requestId,
    success: result.success,
    reason: result.reason,
    service: requestedAdapter.service,
    url: window.location.href,
    ok: result.success
  });
}

function isInsertTextMessage(message: unknown): message is AgentMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "INSERT_TEXT" &&
    "text" in message &&
    typeof message.text === "string"
  );
}
