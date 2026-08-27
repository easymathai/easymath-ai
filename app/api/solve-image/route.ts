import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const transcribeInstructions = `
You transcribe school math from a photo. You do not solve.

Work silently first:
1. Scan left to right, symbol by symbol.
2. Count the written digits, letters, and operators.
3. Output only the transcribed problem.

Handwritten algebra rules:
- A digit immediately followed by a letter is one term with implicit multiplication: 4x means 4 times x.
- Never split that into extra terms. 4x is NOT 4 + x and NOT 4 + 2x.
- A handwritten x is usually two crossing strokes or a cursive loop. That whole pair of strokes is ONE variable x.
- Do not read those two strokes as a plus sign, a times sign, or an extra digit such as 2.
- A plus or minus is a separate mark BETWEEN terms, with space around it, not the crossing of an x.
- Do not invent extra digits, extra operators, extra letters, or extra products.
- Preserve every number, variable, operator, exponent, fraction, and parenthesis that is actually written.
- In algebra, a letter next to a number is usually the variable x. Treat a crossing-stroke letter as x, not c, unless it is clearly a c.

Typical linear equations look like: ax ± b = c
Example: handwritten "4x - 7 = 21" must be transcribed as 4x - 7 = 21
Wrong: 4 + 2x - 7 = 21
Wrong: 4 + x - 7 = 21
Wrong: 42x - 7 = 21

Return ONLY the math transcription on one line. No labels, no quotes, no explanation.
`;

const teacherInstructions = `
You are EasyMath AI, an expert and friendly mathematics teacher.

The student uploaded a photo of a handwritten or printed math problem.
You will be given the exact transcription of that photo. Solve that transcription exactly.
Do not change numbers, variables, or operators. Do not re-interpret the handwriting.

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

function extractTranscription(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const labeled = line.match(
      /^(?:transcription|equation|problem|math)\s*[:\-]\s*(.+)$/i
    );
    const candidate = (labeled?.[1] ?? line)
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (/[0-9=]/.test(candidate) && /[a-zA-Z+\-*/^=()]/.test(candidate)) {
      return candidate;
    }
  }

  return lines[0] ?? "";
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

    const transcriptionResponse = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: transcribeInstructions,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Transcribe the handwritten or printed math in this photo. Read symbol by symbol. If you see a number touching a handwritten x, write them as one term such as 4x, not 4 + 2x. Return only the math.",
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

    const transcription = extractTranscription(
      getOutputText(transcriptionResponse)
    );

    if (!transcription) {
      return NextResponse.json(
        { error: "Unable to read the math in this photo." },
        { status: 500 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: teacherInstructions,
      input: `Solve this exact transcription from the photo. Do not change it.\n\n${transcription}\n\nPut the transcription only as the first step-by-step line, in the form: 1. Read from photo: ${transcription}`,
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
