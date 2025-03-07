import WebSocket from "ws";
import { apiKeys, botConfig } from "./config";
import { createLogger } from "./utils";

const logger = createLogger("Bot");

// Simple message types to replace protobufs
interface AudioMessage {
  type: "audio";
  data: {
    audio: string; // Base64 encoded audio
    sampleRate: number;
    channels: number;
  };
}

interface TranscriptionMessage {
  type: "transcription";
  data: {
    text: string;
    isFinal: boolean;
    startTime: number;
    endTime: number;
  };
}

interface TextMessage {
  type: "text";
  data: {
    text: string;
  };
}

type Message = AudioMessage | TranscriptionMessage | TextMessage;

class TranscriptionBot {
  private server: WebSocket.Server;
  private gladiaSocket: WebSocket | null = null;
  private proxyClient: WebSocket | null = null;

  constructor() {
    this.server = new WebSocket.Server({
      host: botConfig.host,
      port: botConfig.port,
    });
  }

  public async start() {
    logger.info(`Starting bot server on ${botConfig.host}:${botConfig.port}`);

    this.server.on("connection", (ws) => {
      logger.info("Proxy client connected");
      this.proxyClient = ws;

      // Connect to Gladia's WebSocket API
      this.connectToGladia();

      ws.on("message", (message) => {
        try {
          // Parse incoming JSON message
          const msg = JSON.parse(message.toString()) as Message;

          if (msg.type === "audio") {
            // Process audio data
            this.processAudioData(msg.data);
          }
        } catch (error) {
          logger.error("Error processing message:", error);
        }
      });

      ws.on("close", () => {
        logger.info("Proxy client disconnected");
        this.proxyClient = null;

        // Close Gladia connection
        if (this.gladiaSocket) {
          this.gladiaSocket.close();
        }
      });

      ws.on("error", (error) => {
        logger.error("Proxy client error:", error);
      });
    });
  }

  private connectToGladia() {
    this.initGladiaStreamingSession()
      .then((websocketUrl) => {
        logger.info(`Connecting to Gladia WebSocket: ${websocketUrl}`);
        this.gladiaSocket = new WebSocket(websocketUrl);

        this.gladiaSocket.on("open", () => {
          logger.info("Connected to Gladia WebSocket");
        });

        this.gladiaSocket.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString());

            // Process transcription messages from Gladia
            if (message.type === "transcript") {
              const transcriptionData = message.data;
              const isPartial = !transcriptionData.is_final;

              logger.info(
                `Transcription ${isPartial ? "(partial)" : "(final)"}: ${
                  transcriptionData.utterance.text
                }`
              );

              // Send transcription to proxy client
              if (
                this.proxyClient &&
                this.proxyClient.readyState === WebSocket.OPEN
              ) {
                const transcriptionMessage: TranscriptionMessage = {
                  type: "transcription",
                  data: {
                    text: transcriptionData.utterance.text,
                    isFinal: transcriptionData.is_final,
                    startTime: transcriptionData.utterance.start || 0,
                    endTime: transcriptionData.utterance.end || 0,
                  },
                };

                this.proxyClient.send(JSON.stringify(transcriptionMessage));
              }
            }
          } catch (error) {
            logger.error("Error handling Gladia message:", error);
          }
        });

        this.gladiaSocket.on("close", () => {
          logger.info("Gladia WebSocket connection closed");
        });

        this.gladiaSocket.on("error", (error) => {
          logger.error("Gladia WebSocket error:", error);
        });
      })
      .catch((error) => {
        logger.error("Failed to initialize Gladia streaming session:", error);
      });
  }

  private async initGladiaStreamingSession(): Promise<string> {
    try {
      // Initialize a streaming session with Gladia
      const response = await fetch("https://api.gladia.io/v2/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gladia-key": apiKeys.gladia || "",
        },
        body: JSON.stringify({
          sample_rate: botConfig.audioParams.sampleRate,
          encoding: "wav/pcm",
          channels: botConfig.audioParams.channels,
          language_config: {
            languages: ["en"], // Use English language
            code_switching: false,
          },
          messages_config: {
            receive_partial_transcripts: true,
            receive_final_transcripts: true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to initialize Gladia session: ${response.statusText}`
        );
      }

      const data = await response.json();
      return data.url;
    } catch (error) {
      logger.error("Error initializing Gladia session:", error);
      throw error;
    }
  }

  private processAudioData(audioData: {
    audio: string;
    sampleRate: number;
    channels: number;
  }) {
    if (this.gladiaSocket && this.gladiaSocket.readyState === WebSocket.OPEN) {
      try {
        // Send audio data to Gladia
        const audioChunkAction = {
          type: "audio_chunk",
          data: {
            chunk: audioData.audio, // Already base64 encoded
          },
        };

        this.gladiaSocket.send(JSON.stringify(audioChunkAction));
      } catch (error) {
        logger.error("Error sending audio data to Gladia:", error);
      }
    }
  }
}

export { TranscriptionBot };
