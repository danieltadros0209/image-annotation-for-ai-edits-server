import express from "express";
import bodyParser from "body-parser";
import Replicate from "replicate";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/generate", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    if (!req.body?.prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const imageBuffer = req.file.buffer;
    const imageMime = req.file.mimetype;
    const imageBase64 = imageBuffer.toString("base64");
    const imageDataUrl = `data:${imageMime};base64,${imageBase64}`;

    const input = {
      prompt: `Apply the following updates only to the area inside the pink polygon. Never change anything outside of the pink polygon area. ${req.body.prompt}`,
      image_input: [imageDataUrl],
    };

    const output = await replicate.run("google/nano-banana", {
      input,
    });

    if (!output?.url) {
      return res
        .status(502)
        .json({ error: "Image model did not return a URL" });
    }

    const response = await fetch(output.url().href);

    if (!response.ok) {
      return res.status(502).json({
        error: "Failed to fetch generated image",
        status: response.status,
      });
    }

    const outputImageBuffer = await response.arrayBuffer();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "image/png",
    );

    res.send(Buffer.from(outputImageBuffer));
  } catch (err) {
    console.error("Image generation error:", err);

    if (err instanceof Error) {
      if (err.message.includes("ECONNREFUSED")) {
        return res.status(503).json({ error: "AI service unavailable" });
      }

      if (err.message.includes("401")) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      if (err.message.includes("timeout")) {
        return res.status(504).json({ error: "Image generation timed out" });
      }
    }

    return res.status(500).json({ error: "Image generation failed" });
  }
});

export default app;
