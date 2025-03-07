import axios from "axios";
import { apiKeys, apiUrls } from "./config";
import { createLogger } from "./utils";

const logger = createLogger("MeetingBaas");

// Define an interface for the API response
interface MeetingBaasResponse {
  bot_id: string;
  status?: string;
  message?: string;
}

class MeetingBaasClient {
  private apiUrl: string;
  private apiKey: string;
  private botId: string | null = null;

  constructor() {
    this.apiUrl = apiUrls.meetingBaas;
    this.apiKey = apiKeys.meetingBaas || "";

    logger.info(`Initialized with API URL: ${this.apiUrl}`);
  }

  /**
   * Connect to a meeting via MeetingBaas
   * @param meetingUrl URL of the meeting to join
   * @param botName Name of the bot
   * @param webhookUrl URL where MeetingBaas will send events and audio streams
   * @returns Promise that resolves when connected
   */
  async connect(
    meetingUrl: string,
    botName: string,
    webhookUrl?: string
  ): Promise<boolean> {
    try {
      logger.info(`Connecting to meeting: ${meetingUrl}`);

      // Create the bot and join the meeting
      const response = await axios.post(
        `${this.apiUrl}/bots`,
        {
          bot_name: botName,
          meeting_url: meetingUrl,
          reserved: false,
          deduplication_key: botName,
          webhook_url: webhookUrl,
          // You may need to include streaming configuration here
          streaming: {
            output: webhookUrl, // MeetingBaas will stream audio to this URL
          },
        },
        {
          headers: {
            "x-meeting-baas-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info(`API Response: ${JSON.stringify(response.data)}`);

      const data = response.data as MeetingBaasResponse;
      if (!data.bot_id) {
        logger.error("No bot_id in response");
        return false;
      }

      this.botId = data.bot_id;
      logger.info(`Bot created with ID: ${this.botId}`);

      return true;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        logger.error(
          `API Error: ${error.response.status} - ${JSON.stringify(
            error.response.data
          )}`
        );
      } else {
        logger.error("Error connecting to meeting:", error);
      }
      return false;
    }
  }

  public disconnect() {
    if (this.botId) {
      // Remove the bot
      axios
        .delete(`${this.apiUrl}/bots/${this.botId}`, {
          headers: {
            "x-meeting-baas-api-key": this.apiKey,
          },
        })
        .then(() => {
          logger.info(`Bot ${this.botId} successfully removed`);
        })
        .catch((error) => {
          logger.error("Error removing bot:", error);
        });

      this.botId = null;
    }
  }
}

export { MeetingBaasClient };
