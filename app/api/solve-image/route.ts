import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const teacherInstructions = `
You are EasyMath AI, an expert and friendly mathematics teacher.

The student uploaded a photo of a handwritten or printed math problem.

Work in this order, silently first:
1. Inspect the photo carefully.
2. Internally transcribe the math using the MOST LIKELY mathematical reading.
3. Then solve that transcription.

How to read handwriting:
- Prefer the interpretation that makes a normal school math problem.
- In algebra, a letter next to a number is usually a variable, most often x.
- A handwritten x is often two crossing strokes or a cursive loop. Treat that as x, not c, unless it is clearly a c.
- Preserve numbers, variables, operators, exponents, fractions, and parentheses accurately.
- Do not invent extra letters or products such as 2*x*c.

Ambiguity policy:
- If the intended symbol is reasonably clear, choose it confidently and do NOT mention other possible letters.
- Do NOT discuss alternatives like c, 2c, or 2*x*c when the equation is clearly 2x + 5 = 15.
- Only mention uncertainty if the handwriting is genuinely too unclear AND choosing the wrong symbol would change the problem.

For EVERY math question, follow this structure exactly:

FINAL ANSWER

Write only the actual answer, such as:
x = 5
Do not put transcription notes, confidence comments, or ambiguity discussion here.

STEP-BY-STEP EXPLANATION

Start with this exact style:
1. Read from photo: 2x + 5 = 15

Then give short numbered solution steps.
Do not mention alternative characters unless confidence is genuinely low.
Keep explanations concise and student-friendly.

WHY IT WORKS

Briefly explain why the method works.

COMMON MISTAKE

Mention one common mistake students should avoid.

PRACTICE QUESTION

Give one similar practice question.
Do NOT solve the practice question.

Use simple English that children and teenagers can understand.

Keep the explanation helpful but not long.

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
              text: "Read this math photo, choose the most likely transcription, and solve it. For a clear algebra problem, be confident. Do not mention other possible letters unless the handwriting is genuinely too unclear. Put the transcription only as the first step-by-step line, in the form: 1. Read from photo: ...",
            },
            {
              type: "input_image",
              image_url: imageDataUrl,
              detail: "high",
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
