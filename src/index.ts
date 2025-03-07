import { MeetingBaasClient } from "./meetingbaas";
import { TranscriptionProxy } from "./proxy";
import { createLogger } from "./utils";

const logger = createLogger("Main");

async function main() {
  try {
    // Extract command line arguments
    const args = process.argv.slice(2);
    const meetingUrl = args[0] || "";
    const botName = args[1] || "Meeting Transcriber";
    const webhookUrl = args[2] || "";

    if (!meetingUrl) {
      console.error("Please provide a meeting URL as the first argument");
      process.exit(1);
    }

    // Initialize the proxy server (now starts automatically in constructor)
    const proxy = new TranscriptionProxy();

    // Initialize MeetingBaas client
    const meetingBaas = new MeetingBaasClient();
    await meetingBaas.connect(meetingUrl, botName, webhookUrl);

    logger.info("System initialized successfully");
  } catch (error) {
    logger.error("Error during startup:", error);
    process.exit(1);
  }
}

main();
