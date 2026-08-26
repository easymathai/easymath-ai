import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const teacherInstructions = `
You are EasyMath AI, an expert and friendly mathematics teacher.

Your goal is not only to give the correct answer.
Your goal is to help the student understand the method.

The student uploaded a photo of a math problem. Read the problem from the image, then solve it.

For EVERY math question, follow this structure:

FINAL ANSWER

Give the final answer clearly and briefly.

STEP-BY-STEP EXPLANATION

Explain the solution in simple numbered steps.
Never skip important steps.
Show calculations clearly.

WHY IT WORKS

Briefly explain why the method works.

COMMON MISTAKE

Mention one common mistake students should avoid.

PRACTICE QUESTION

Give one similar practice question.
Do NOT solve the practice question.

Use simple English that children and teenagers can understand.

Keep the explanation helpful but not unnecessarily long.

Always end with:

Great job! 🌟 Keep practising and you'll become stronger at maths.
`;

function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function isHeicHeif(buffer: Buffer, file: File): boolean {
  if (buffer.length >= 12 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const header = buffer
      .subarray(8, Math.min(buffer.length, 64))
      .toString("ascii")
      .toLowerCase();

    if (/heic|heix|heif|hevc|hevx|mif1|msf1|heim|heis/.test(header)) {
      return true;
    }
  }

  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    name.endsWith(".hif")
  );
}

async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  const loaded = await import("heic-convert");
  const convert = (loaded.default ?? loaded) as (options: {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality: number;
  }) => Promise<ArrayBuffer>;

  const jpeg = await convert({
    buffer,
    format: "JPEG",
    quality: 0.92,
  });

  return Buffer.from(jpeg);
}

async function prepareImageForOpenAI(
  file: File,
  buffer: Buffer
): Promise<{ mimeType: string; imageBuffer: Buffer }> {
  const mimeType = detectImageMime(buffer);

  if (mimeType) {
    return { mimeType, imageBuffer: buffer };
  }

  if (isHeicHeif(buffer, file)) {
    const jpegBuffer = await heicToJpeg(buffer);
    return { mimeType: "image/jpeg", imageBuffer: jpegBuffer };
  }

  throw new Error("UNSUPPORTED_IMAGE");
}

function getOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  const parts: string[] = [];

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No image uploaded." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let prepared: { mimeType: string; imageBuffer: Buffer };

    try {
      prepared = await prepareImageForOpenAI(file, buffer);
    } catch (error) {
      if (error instanceof Error && error.message === "UNSUPPORTED_IMAGE") {
        return NextResponse.json(
          {
            error:
              "Please upload a photo in JPEG, PNG, GIF, WebP, or HEIC/HEIF format.",
          },
          { status: 400 }
        );
      }

      console.error("HEIC conversion error:", error);

      return NextResponse.json(
        { error: "Unable to convert this iPhone photo. Please try another photo." },
        { status: 400 }
      );
    }

    const imageDataUrl = `data:${prepared.mimeType};base64,${prepared.imageBuffer.toString("base64")}`;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: teacherInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Solve the math problem shown in this image.",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "auto",
            },
          ],
        },
      ],
    });

    const solution = getOutputText(response);

    if (!solution) {
      return NextResponse.json(
        { error: "No solution returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      solution,
    });
  } catch (error) {
    console.error("solve-image error:", error);

    return NextResponse.json(
      { error: "Unable to read image." },
      { status: 500 }
    );
  }
}
